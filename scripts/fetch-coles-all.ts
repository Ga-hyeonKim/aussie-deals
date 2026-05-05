import { config } from "dotenv";
import process from "process";
import fs from "fs";
import path from "path";

config({ path: path.join(__dirname, "../.env") });
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../app/generated/prisma/client";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "playwright";

chromium.use(StealthPlugin());

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DUMP_PATH = path.join(__dirname, "coles-all-dump.json");
const BATCH_SIZE = 50;
const PAGE_DELAY_MS = 1500;
const COLES_BASE = "https://www.coles.com.au";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// 프로모션성 카테고리(Back to School, Down Down 등) 제외 — 일반 상품 카테고리만
const CATEGORIES = [
  { slug: "fruit-vegetables",        name: "Fruit & Vegetables" },
  { slug: "meat-seafood",            name: "Meat & Seafood" },
  { slug: "dairy-eggs-fridge",       name: "Dairy, Eggs & Fridge" },
  { slug: "bakery",                  name: "Bakery" },
  { slug: "deli",                    name: "Deli" },
  { slug: "pantry",                  name: "Pantry" },
  { slug: "dietary-world-foods",     name: "Dietary & World Foods" },
  { slug: "chips-chocolates-snacks", name: "Chips, Chocolates & Snacks" },
  { slug: "drinks",                  name: "Drinks" },
  { slug: "liquorland",              name: "Beer, Wine & Spirits" },
  { slug: "frozen",                  name: "Frozen" },
  { slug: "cleaning-laundry",        name: "Cleaning & Laundry" },
  { slug: "health-beauty",           name: "Health & Beauty" },
  { slug: "baby",                    name: "Baby" },
  { slug: "pet",                     name: "Pet" },
  { slug: "home-garden",             name: "Home & Garden" },
];

let _browser: Browser | null = null;
let _page: Page | null = null;

async function getPage(): Promise<Page> {
  if (_page) return _page;

  _browser = await chromium.launch({ headless: true });
  const context = await _browser.newContext({
    userAgent: USER_AGENT,
    locale: "en-AU",
    extraHTTPHeaders: { "Accept-Language": "en-AU,en;q=0.9" },
  });
  _page = await context.newPage();
  return _page;
}

// --- Types ---

interface ColesRawProduct {
  id?: number;
  name?: string;
  brand?: string;
  size?: string;
  imageUris?: Array<{ uri: string }>;
  onlineHeirs?: Array<{ subCategory?: string; category?: string }>;
  pricing?: { now?: number };
}

interface ParsedProduct {
  name: string;
  brand: string | null;
  category: string;
  unit: string | null;
  price: number;
  imageUrl: string | null;
}

// --- Helpers ---

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// --- Coles browse ---

async function fetchCategoryPage(
  slug: string,
  pageNum: number,
  isFirstInCategory: boolean
): Promise<{ results: ColesRawProduct[]; noOfResults: number; pageSize: number; assetsUrl: string }> {
  const page = await getPage();

  if (isFirstInCategory || pageNum === 1) {
    await page.goto(`${COLES_BASE}/browse/${slug}`, { waitUntil: "load", timeout: 30000 });
  } else {
    // After page 1, use redirect-resolved URL to preserve /en/ prefix
    const baseUrl = page.url().split("?")[0];
    await page.goto(`${baseUrl}?page=${pageNum}`, { waitUntil: "load", timeout: 30000 });
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const data = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nd = (window as any).__NEXT_DATA__;
      if (!nd) return null;
      const pp = nd.props?.pageProps;
      if (!pp) return null;
      return {
        searchResults: pp.searchResults ?? null,
        assetsUrl: (pp.assetsUrl as string) ?? "https://cdn.productimages.coles.com.au/productimages",
      };
    });

    if (data?.searchResults) {
      const sr = data.searchResults as Record<string, unknown>;
      return {
        results: (sr.results as ColesRawProduct[]) ?? [],
        noOfResults: (sr.noOfResults as number) ?? 0,
        pageSize: (sr.pageSize as number) ?? 48,
        assetsUrl: data.assetsUrl,
      };
    }

    if (attempt < 2) {
      console.log(`[Coles All] ${slug} p${pageNum} 챌린지 감지 — 재시도 (${attempt + 1}/3)...`);
      await new Promise(r => setTimeout(r, 4000 + attempt * 3000));
      await page.reload({ waitUntil: "load", timeout: 30000 });
    }
  }

  throw new Error(`[Coles All] searchResults 없음 — ${slug} page ${pageNum}`);
}

function parseProduct(p: ColesRawProduct, fallbackCategory: string, assetsUrl: string): ParsedProduct | null {
  if (!p.name || !p.pricing?.now) return null;

  const name = p.brand ? `${p.brand} ${p.name}` : p.name;

  return {
    name,
    brand: p.brand ?? null,
    category: p.onlineHeirs?.[0]?.subCategory ?? p.onlineHeirs?.[0]?.category ?? fallbackCategory,
    unit: p.size ?? null,
    price: p.pricing.now,
    imageUrl: p.imageUris?.[0]?.uri ? assetsUrl + p.imageUris[0].uri : null,
  };
}

// --- Collection ---

async function collectCategory(
  cat: { slug: string; name: string },
  seenIds: Set<number>
): Promise<ParsedProduct[]> {
  const products: ParsedProduct[] = [];
  let pageNum = 1;
  let totalPages = 1;
  let assetsUrl = "";

  while (pageNum <= totalPages) {
    const isFirstInCategory = pageNum === 1;
    const data = await fetchCategoryPage(cat.slug, pageNum, isFirstInCategory);

    if (pageNum === 1) {
      totalPages = Math.ceil(data.noOfResults / data.pageSize);
      assetsUrl = data.assetsUrl;
    }

    for (const raw of data.results) {
      if (raw.id && seenIds.has(raw.id)) continue;
      if (raw.id) seenIds.add(raw.id);
      const parsed = parseProduct(raw, cat.name, assetsUrl);
      if (parsed) products.push(parsed);
    }

    pageNum++;
    if (pageNum <= totalPages) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
  }

  return products;
}

async function collect(): Promise<ParsedProduct[]> {
  console.log("[Coles All] 전체 카탈로그 수집 시작...");
  const startTime = Date.now();
  const allProducts: ParsedProduct[] = [];
  const seenIds = new Set<number>();

  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const catStart = Date.now();
    try {
      const products = await collectCategory(cat, seenIds);
      allProducts.push(...products);
      console.log(
        `[Coles All] (${i + 1}/${CATEGORIES.length}) ✓ ${cat.name}: ${products.length}개 (${fmt(Date.now() - catStart)}) — 누계 ${allProducts.length}개`
      );
    } catch (e) {
      console.error(`[Coles All] ✗ ${cat.name} 실패 (건너뜀):`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`[Coles All] 수집 완료: ${allProducts.length}개 (${fmt(Date.now() - startTime)})`);
  return allProducts;
}

// --- DB Save ---

async function upsertBatch(products: ParsedProduct[]): Promise<void> {
  const results = await Promise.all(
    products.map(async p => {
      try {
        const sp = await prisma.storeProduct.upsert({
          where: { store_name: { store: "COLES", name: p.name } },
          update: {
            brand: p.brand,
            unit: p.unit,
            imageUrl: p.imageUrl,
            category: p.category,
          },
          create: {
            store: "COLES",
            name: p.name,
            brand: p.brand,
            category: p.category,
            unit: p.unit,
            price: p.price,
            imageUrl: p.imageUrl,
          },
          select: { id: true },
        });
        return { id: sp.id, price: p.price };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[Coles All] ${p.name} 저장 실패:`, msg);
        return null;
      }
    })
  );

  const history = results.filter(Boolean).map(r => ({
    storeProductId: r!.id,
    price: r!.price,
    isOnSale: false,
  }));

  if (history.length > 0) {
    await prisma.priceHistory.createMany({ data: history }).catch(() => {});
  }
}

async function saveToDb(products: ParsedProduct[]) {
  console.log(`[Coles All] DB 저장 시작: ${products.length}개...`);
  await prisma.$queryRaw`SELECT 1`;
  console.log("[Coles All] DB 연결 확인 완료.");

  const startTime = Date.now();
  let saved = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    await upsertBatch(batch);
    saved += batch.length;
    const elapsed = Date.now() - startTime;
    const rate = saved / (elapsed / 1000);
    const remaining = (products.length - saved) / rate;
    if (saved % 500 === 0 || saved === products.length) {
      console.log(
        `[Coles All] ${saved}/${products.length} — 경과 ${fmt(elapsed)}, 예상 남은 ${fmt(remaining * 1000)}`
      );
    }
  }

  console.log(`[Coles All] DB 저장 완료 (총 ${fmt(Date.now() - startTime)})`);
}

// --- Main ---

function deduplicate(products: ParsedProduct[]): ParsedProduct[] {
  const seen = new Set<string>();
  return products.filter(p => {
    const key = `COLES:${p.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const fromJson = process.argv.includes("--from-json");

  let unique: ParsedProduct[];

  if (fromJson) {
    if (!fs.existsSync(DUMP_PATH)) {
      console.error(`[Coles All] dump 파일 없음: ${DUMP_PATH}`);
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(DUMP_PATH, "utf-8")) as ParsedProduct[];
    unique = deduplicate(raw);
    console.log(`[Coles All] dump 파일 로드: ${raw.length}개 → 중복 제거 후 ${unique.length}개`);
  } else {
    const allProducts = await collect();
    unique = deduplicate(allProducts);
    console.log(`[Coles All] 총 ${allProducts.length}개 수집, 중복 제거 후 ${unique.length}개`);

    fs.writeFileSync(DUMP_PATH, JSON.stringify(unique, null, 2));
    console.log(`[Coles All] dump 파일 저장 완료: ${DUMP_PATH}`);
  }

  await saveToDb(unique);
  await prisma.$disconnect();
  await _browser?.close();
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect();
  await _browser?.close();
  process.exit(1);
});
