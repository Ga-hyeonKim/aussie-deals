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

interface RawProduct {
  Name?: string;
  Brand?: string;
  PackageSize?: string;
  Price?: number;
  MediumImageFile?: string;
  SmallImageFile?: string;
  LargeImageFile?: string;
}

interface ParsedProduct {
  name: string;
  brand: string | null;
  category: string;
  unit: string | null;
  price: number;
  imageUrl: string | null;
}

function parseProduct(p: RawProduct, category: string): ParsedProduct | null {
  if (!p.Name || !p.Price) return null;

  return {
    name: p.Name,
    brand: p.Brand ?? null,
    category,
    unit: p.PackageSize ?? null,
    price: p.Price,
    imageUrl: p.MediumImageFile ?? p.LargeImageFile ?? p.SmallImageFile ?? null,
  };
}

async function fetchCategoryAll(
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
              url: `/shop/browse/${categoryId}`,
              location: `/shop/browse/${categoryId}`,
              formatObject: JSON.stringify({ name: "All" }),
              isSpecial: false,
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

const BATCH_SIZE = 100;

async function upsertBatch(products: ParsedProduct[]) {
  await prisma.$transaction(
    products.map(p =>
      prisma.storeProduct.upsert({
        where: {
          store_name: {
            store: "WOOLWORTHS",
            name: p.name,
          },
        },
        update: {
          brand: p.brand,
          category: p.category,
          unit: p.unit,
          price: p.price,
          imageUrl: p.imageUrl,
        },
        create: {
          store: "WOOLWORTHS",
          name: p.name,
          brand: p.brand,
          category: p.category,
          unit: p.unit,
          price: p.price,
          imageUrl: p.imageUrl,
        },
      })
    )
  );
}

async function main() {
  console.log("[Woolworths All] 전체 품목 수집 시작...");

  let browser: import("playwright").Browser | undefined;
  const allProducts: ParsedProduct[] = [];

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto("https://www.woolworths.com.au/shop/browse", {
      waitUntil: "load",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    console.log("[Woolworths All] 세션 준비 완료. 카테고리별 수집 시작...");

    for (const cat of CATEGORIES) {
      const products = await fetchCategoryAll(page, cat);
      allProducts.push(...products);
      console.log(`[Woolworths All] ${cat.name}: ${products.length}개`);
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    if (browser) await browser.close();
  }

  const seen = new Set<string>();
  const unique = allProducts.filter(p => {
    const key = `WOOLWORTHS:${p.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`[Woolworths All] 총 ${allProducts.length}개 수집, 중복 제거 후 ${unique.length}개. DB 저장 중...`);

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    await upsertBatch(batch);
    const done = Math.min(i + BATCH_SIZE, unique.length);
    if (done % 1000 === 0 || done === unique.length) {
      console.log(`[Woolworths All] DB 저장 진행: ${done}/${unique.length}`);
    }
  }

  console.log(`[Woolworths All] DB 저장 완료: ${unique.length}개`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
