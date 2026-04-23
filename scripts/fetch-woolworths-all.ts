import { config } from "dotenv";
import process from "process";
import fs from "fs";
import path from "path";

config({ path: path.join(__dirname, "../.env") });
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../app/generated/prisma/client";

chromium.use(StealthPlugin());

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DUMP_PATH = path.join(__dirname, "woolworths-dump.json");
const BATCH_SIZE = 25;

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

async function upsertBatch(products: ParsedProduct[], batchIndex: number): Promise<void> {
  try {
    await prisma.$transaction(
      products.map(p =>
        prisma.storeProduct.upsert({
          where: { store_name: { store: "WOOLWORTHS", name: p.name } },
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
      ),
      { timeout: 30000 }
    );
  } catch (err) {
    console.error(`[Woolworths All] 배치 ${batchIndex} 실패, 개별 저장으로 재시도...`, err);
    // fallback: individual upserts
    for (const p of products) {
      await prisma.storeProduct.upsert({
        where: { store_name: { store: "WOOLWORTHS", name: p.name } },
        update: { brand: p.brand, category: p.category, unit: p.unit, price: p.price, imageUrl: p.imageUrl },
        create: { store: "WOOLWORTHS", name: p.name, brand: p.brand, category: p.category, unit: p.unit, price: p.price, imageUrl: p.imageUrl },
      }).catch(e => console.error(`[Woolworths All] ${p.name} 저장 실패:`, e.message));
    }
  }
}

async function saveToDb(products: ParsedProduct[]) {
  console.log(`[Woolworths All] DB 저장 시작: ${products.length}개...`);

  // warm-up query to wake Neon from sleep
  await prisma.$queryRaw`SELECT 1`;
  console.log("[Woolworths All] DB 연결 확인 완료.");

  let saved = 0;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    await upsertBatch(batch, Math.floor(i / BATCH_SIZE));
    saved += batch.length;
    if (saved % 500 === 0 || saved >= products.length) {
      console.log(`[Woolworths All] DB 저장 진행: ${saved}/${products.length}`);
    }
  }

  console.log(`[Woolworths All] DB 저장 완료: ${products.length}개`);
}

function deduplicate(products: ParsedProduct[]): ParsedProduct[] {
  const seen = new Set<string>();
  return products.filter(p => {
    const key = `WOOLWORTHS:${p.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function collect(): Promise<ParsedProduct[]> {
  console.log("[Woolworths All] 전체 품목 수집 시작...");
  const allProducts: ParsedProduct[] = [];
  let browser: import("playwright").Browser | undefined;

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

  return allProducts;
}

async function main() {
  const fromJson = process.argv.includes("--from-json");

  let unique: ParsedProduct[];

  if (fromJson) {
    if (!fs.existsSync(DUMP_PATH)) {
      console.error(`[Woolworths All] dump 파일 없음: ${DUMP_PATH}`);
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(DUMP_PATH, "utf-8")) as ParsedProduct[];
    unique = deduplicate(raw);
    console.log(`[Woolworths All] dump 파일 로드: ${raw.length}개 → 중복 제거 후 ${unique.length}개`);
  } else {
    const allProducts = await collect();
    unique = deduplicate(allProducts);
    console.log(`[Woolworths All] 총 ${allProducts.length}개 수집, 중복 제거 후 ${unique.length}개`);

    fs.writeFileSync(DUMP_PATH, JSON.stringify(unique, null, 2));
    console.log(`[Woolworths All] dump 파일 저장 완료: ${DUMP_PATH}`);
  }

  await saveToDb(unique);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
