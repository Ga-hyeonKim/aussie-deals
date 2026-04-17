import "dotenv/config";
import process from "process";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../app/generated/prisma/client";

chromium.use(StealthPlugin());

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CATEGORIES = [
  { id: "1-E5BEE36E", name: "Fruit & Veg" },
  { id: "1_D5A2236", name: "Poultry, Meat & Seafood" },
  { id: "1_8AD6702", name: "Dinner" },
  { id: "1_3151F6F", name: "Deli" },
  { id: "1_6E4F4E4", name: "Dairy, Eggs & Fridge" },
  { id: "1_DEB537E", name: "Bakery" },
  { id: "1_ACA2FC2", name: "Freezer" },
  { id: "1_717445A", name: "Snacks & Confectionery" },
  { id: "1_39FD49C", name: "Pantry" },
  { id: "1_5AF3A0A", name: "Drinks" },
  { id: "1_8E4DA6F", name: "Beer, Wine & Spirits" },
  { id: "1_8D61DD6", name: "Beauty" },
  { id: "1_894D0A8", name: "Personal Care" },
  { id: "1_717A94B", name: "Baby" },
  { id: "1_61D6FEB", name: "Pet" },
];

// Woolworths weekly specials run Wed–Tue (AU time)
// All dates anchored to AWST (UTC+8) so results are consistent
// regardless of where the script runs (local machine vs GitHub Actions)
function getWeekRange(): { validFrom: Date; validTo: Date } {
  const AWST_MS = 8 * 60 * 60 * 1000;
  const nowAWST = new Date(Date.now() + AWST_MS);

  const day = nowAWST.getUTCDay(); // day of week in AWST
  const daysSinceWed = (day - 3 + 7) % 7;

  // This Wednesday 00:00 AWST
  const fromAWST = new Date(nowAWST);
  fromAWST.setUTCDate(nowAWST.getUTCDate() - daysSinceWed);
  fromAWST.setUTCHours(0, 0, 0, 0);

  // Next Wednesday 01:00 AWST — buffer so old deals stay visible
  // until the new scrape runs (new specials go live ~05:00 AWST)
  const toAWST = new Date(fromAWST.getTime() + 7 * 24 * 3600000 + 1 * 3600000);

  return {
    validFrom: new Date(fromAWST.getTime() - AWST_MS),
    validTo: new Date(toAWST.getTime() - AWST_MS),
  };
}

interface RawProduct {
  Name?: string;
  Brand?: string;
  PackageSize?: string;
  Price?: number;
  WasPrice?: number;
  IsOnSpecial?: boolean;
  MediumImageFile?: string;
  SmallImageFile?: string;
  LargeImageFile?: string;
}

interface ParsedProduct {
  name: string;
  brand: string | null;
  category: string;
  unit: string | null;
  salePrice: number;
  originalPrice: number | null;
  discountPercent: number | null;
  imageUrl: string | null;
}

function parseProduct(p: RawProduct, category: string): ParsedProduct | null {
  if (!p.IsOnSpecial && !(p.WasPrice && p.WasPrice > (p.Price ?? 0))) return null;
  if (!p.Name || !p.Price) return null;

  let discountPercent: number | null = null;
  if (p.WasPrice && p.WasPrice > p.Price) {
    discountPercent = Math.round(((p.WasPrice - p.Price) / p.WasPrice) * 100);
  }

  return {
    name: p.Name,
    brand: p.Brand ?? null,
    category,
    unit: p.PackageSize ?? null,
    salePrice: p.Price,
    originalPrice: p.WasPrice ?? null,
    discountPercent,
    imageUrl: p.MediumImageFile ?? p.LargeImageFile ?? p.SmallImageFile ?? null,
  };
}

async function fetchCategorySpecials(
  page: import("playwright").Page,
  cat: { id: string; name: string }
): Promise<ParsedProduct[]> {
  const products: ParsedProduct[] = [];
  let pageNumber = 1;
  const pageSize = 36;

  while (true) {
    const result = await page.evaluate(
      async ({ categoryId, pageNumber, pageSize }) => {
        try {
          const res = await fetch("/apis/ui/browse/category", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              categoryId,
              pageNumber,
              pageSize,
              sortType: "TraderRelevance",
              url: "/shop/browse/specials",
              location: "/shop/browse/specials",
              formatObject: JSON.stringify({ name: "Specials" }),
              isSpecial: true,
              isBundle: false,
              isMobile: false,
              filters: [],
            }),
          });
          return await res.json();
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
      { categoryId: cat.id, pageNumber, pageSize }
    );

    if (result.error || !result.Bundles) break;

    if (pageNumber === 1 && products.length === 0) {
      const sample = result.Bundles?.[0]?.Products?.[0];
      if (sample) {
        const imageKeys = Object.keys(sample).filter(k => /image|img|photo|thumb|media/i.test(k));
        console.log(`[DEBUG] Sample product keys with 'image': ${JSON.stringify(imageKeys)}`);
        console.log(`[DEBUG] Sample values:`, imageKeys.map(k => `${k}=${sample[k]}`));
      }
    }

    let pageProducts = 0;
    for (const bundle of result.Bundles) {
      for (const p of bundle.Products ?? []) {
        const parsed = parseProduct(p, cat.name);
        if (parsed) {
          products.push(parsed);
          pageProducts++;
        }
      }
    }

    const totalPages = Math.ceil((result.TotalRecordCount ?? 0) / pageSize);
    if (pageNumber >= totalPages || pageProducts === 0) break;
    pageNumber++;
    await new Promise((r) => setTimeout(r, 300));
  }

  return products;
}

async function main() {
  const { validFrom, validTo } = getWeekRange();
  console.log(`[Woolworths] 수집 기간: ${validFrom.toDateString()} ~ ${validTo.toDateString()}`);

  let browser: import("playwright").Browser | undefined;
  const allProducts: ParsedProduct[] = [];

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto("https://www.woolworths.com.au/shop/browse/specials", {
      waitUntil: "load",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    console.log("[Woolworths] 세션 준비 완료. 카테고리별 수집 시작...");

    for (const cat of CATEGORIES) {
      const products = await fetchCategorySpecials(page, cat);
      allProducts.push(...products);
      console.log(`[Woolworths] ${cat.name}: ${products.length}개`);
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    if (browser) await browser.close();
  }

  console.log(`[Woolworths] 총 ${allProducts.length}개 수집. DB 저장 중...`);

  let upserted = 0;
  for (const p of allProducts) {
    await prisma.product.upsert({
      where: {
        store_name_validFrom: {
          store: "WOOLWORTHS",
          name: p.name,
          validFrom,
        },
      },
      update: {
        salePrice: p.salePrice,
        originalPrice: p.originalPrice,
        discountPercent: p.discountPercent,
        brand: p.brand,
        unit: p.unit,
        imageUrl: p.imageUrl,
        validTo,
      },
      create: {
        store: "WOOLWORTHS",
        name: p.name,
        brand: p.brand,
        category: p.category,
        unit: p.unit,
        salePrice: p.salePrice,
        originalPrice: p.originalPrice,
        discountPercent: p.discountPercent,
        imageUrl: p.imageUrl,
        validFrom,
        validTo,
      },
    });
    upserted++;
  }

  console.log(`[Woolworths] DB 저장 완료: ${upserted}개`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
