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

const DUMP_PATH = path.join(__dirname, "coles-dump.json");
const BATCH_SIZE = 50;
const PAGE_DELAY_MS = 1000;
const COLES_BASE = "https://www.coles.com.au";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

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
  await _page.goto(`${COLES_BASE}/on-special`, { waitUntil: "load", timeout: 30000 });
  return _page;
}

// --- Types ---

interface ColesRawProduct {
  id: number;
  name?: string;
  brand?: string;
  size?: string;
  imageUris?: Array<{ uri: string }>;
  onlineHeirs?: Array<{ subCategory?: string; category?: string }>;
  pricing?: {
    now?: number;
    was?: number;
    savePercent?: number;
    promotionType?: string;
    specialType?: string;
  };
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

// --- Helpers ---

function getWeekRange(): { validFrom: Date; validTo: Date } {
  const AWST_MS = 8 * 60 * 60 * 1000;
  const nowAWST = new Date(Date.now() + AWST_MS);

  const day = nowAWST.getUTCDay();
  const daysSinceWed = (day - 3 + 7) % 7;

  const fromAWST = new Date(nowAWST);
  fromAWST.setUTCDate(nowAWST.getUTCDate() - daysSinceWed);
  fromAWST.setUTCHours(0, 0, 0, 0);

  const toAWST = new Date(fromAWST.getTime() + 7 * 24 * 3600000 + 1 * 3600000);

  return {
    validFrom: new Date(fromAWST.getTime() - AWST_MS),
    validTo: new Date(toAWST.getTime() - AWST_MS),
  };
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// --- Coles API ---

async function fetchSpecialsPage(
  pageNum: number
): Promise<{ results: ColesRawProduct[]; noOfResults: number; pageSize: number; assetsUrl: string }> {
  const page = await getPage();

  // Navigate to each page directly — __NEXT_DATA__ in the SSR'd HTML gives us the data
  // without any XHR/fetch calls that Imperva blocks
  if (pageNum > 1) {
    // Use actual URL after any redirect (e.g. /on-special → /en/on-special)
    const baseUrl = page.url().split("?")[0];
    await page.goto(`${baseUrl}?page=${pageNum}`, { waitUntil: "load", timeout: 30000 });
  }

  // Imperva occasionally injects a challenge page mid-session — retry with reload
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
      console.log(`[Coles] page ${pageNum} 챌린지 감지 — 재시도 (${attempt + 1}/3)...`);
      await new Promise(r => setTimeout(r, 4000 + attempt * 3000));
      await page.reload({ waitUntil: "load", timeout: 30000 });
    }
  }

  throw new Error(`[Coles] searchResults 없음 — page ${pageNum}`);
}

function parseProduct(p: ColesRawProduct, assetsUrl: string): ParsedProduct | null {
  if (!p.name || !p.pricing?.now) return null;

  const name = p.brand ? `${p.brand} ${p.name}` : p.name;
  const was = p.pricing.was ?? 0;
  const now = p.pricing.now;

  let originalPrice: number | null = null;
  let discountPercent: number | null = null;

  if (was > 0 && was > now) {
    originalPrice = was;
    discountPercent = p.pricing.savePercent ?? Math.round(((was - now) / was) * 100);
  }

  return {
    name,
    brand: p.brand ?? null,
    category: p.onlineHeirs?.[0]?.subCategory ?? p.onlineHeirs?.[0]?.category ?? "Uncategorised",
    unit: p.size ?? null,
    salePrice: now,
    originalPrice,
    discountPercent,
    imageUrl: p.imageUris?.[0]?.uri ? assetsUrl + p.imageUris[0].uri : null,
  };
}

// --- Collection ---

async function collect(): Promise<ParsedProduct[]> {
  console.log("[Coles] 주간 특가 수집 시작...");

  const startTime = Date.now();
  const allProducts: ParsedProduct[] = [];
  const seenIds = new Set<number>();
  let pageNum = 1;
  let totalPages = 1;
  let assetsUrl = "";

  while (pageNum <= totalPages) {
    const data = await fetchSpecialsPage(pageNum);

    if (pageNum === 1) {
      totalPages = Math.ceil(data.noOfResults / data.pageSize);
      assetsUrl = data.assetsUrl;
      console.log(`[Coles] 총 ${data.noOfResults}개, ${totalPages} 페이지`);
    }

    for (const raw of data.results) {
      if (raw.id && seenIds.has(raw.id)) continue;
      if (raw.id) seenIds.add(raw.id);
      const parsed = parseProduct(raw, assetsUrl);
      if (parsed) allProducts.push(parsed);
    }

    if (pageNum % 20 === 0 || pageNum === totalPages) {
      console.log(`[Coles] ${pageNum}/${totalPages} 페이지 — ${allProducts.length}개 수집 (${fmt(Date.now() - startTime)})`);
    }

    pageNum++;
    if (pageNum <= totalPages) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
  }

  console.log(`[Coles] 수집 완료: ${allProducts.length}개 (${fmt(Date.now() - startTime)})`);
  return allProducts;
}

// --- DB Save ---

async function upsertBatch(
  products: ParsedProduct[],
  validFrom: Date,
  validTo: Date
): Promise<void> {
  const results = await Promise.all(
    products.map(async p => {
      try {
        await prisma.product.upsert({
          where: { store_name_validFrom: { store: "COLES", name: p.name, validFrom } },
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
            store: "COLES",
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

        const sp = await prisma.storeProduct.upsert({
          where: { store_name: { store: "COLES", name: p.name } },
          update: {
            // originalPrice가 있을 때만 가격 업데이트 (MULTI_SAVE는 null이라 세일가로 덮지 않음)
            ...(p.originalPrice !== null ? { price: p.originalPrice } : {}),
            imageUrl: p.imageUrl,
          },
          create: {
            store: "COLES",
            name: p.name,
            brand: p.brand,
            category: p.category,
            unit: p.unit,
            price: p.originalPrice ?? p.salePrice,
            imageUrl: p.imageUrl,
          },
          select: { id: true },
        });

        return { id: sp.id, price: p.salePrice };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[Coles] ${p.name} 저장 실패:`, msg);
        return null;
      }
    })
  );

  const history = results.filter(Boolean).map(r => ({
    storeProductId: r!.id,
    price: r!.price,
    isOnSale: true,
  }));

  if (history.length > 0) {
    await prisma.priceHistory.createMany({ data: history }).catch((e: Error) => console.error(`[Coles] PriceHistory createMany 실패:`, e.message));
  }
}

async function saveToDb(products: ParsedProduct[]) {
  const { validFrom, validTo } = getWeekRange();
  console.log(`[Coles] 유효 기간: ${validFrom.toDateString()} ~ ${validTo.toDateString()}`);
  console.log(`[Coles] DB 저장 시작: ${products.length}개...`);

  await prisma.$queryRaw`SELECT 1`;
  console.log("[Coles] DB 연결 확인 완료.");

  const startTime = Date.now();
  let saved = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    await upsertBatch(batch, validFrom, validTo);
    saved += batch.length;
    const elapsed = Date.now() - startTime;
    const rate = saved / (elapsed / 1000);
    const remaining = (products.length - saved) / rate;
    console.log(
      `[Coles] ${saved}/${products.length} — 경과 ${fmt(elapsed)}, 예상 남은 시간 ${fmt(remaining * 1000)}`
    );
  }

  console.log(`[Coles] DB 저장 완료: ${products.length}개 (총 ${fmt(Date.now() - startTime)})`);
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

async function fixCategories(products: ParsedProduct[]): Promise<void> {
  // category별로 묶어서 updateMany — Product + StoreProduct 각각 1쿼리씩
  const byCategory = new Map<string, string[]>();
  for (const p of products) {
    const names = byCategory.get(p.category) ?? [];
    names.push(p.name);
    byCategory.set(p.category, names);
  }

  await prisma.$queryRaw`SELECT 1`;
  console.log(`[Coles] 카테고리 업데이트 시작: ${byCategory.size}개 카테고리...`);

  for (const [category, names] of byCategory) {
    await prisma.product.updateMany({
      where: { store: "COLES", name: { in: names } },
      data: { category },
    });
    await prisma.storeProduct.updateMany({
      where: { store: "COLES", name: { in: names } },
      data: { category },
    });
    console.log(`[Coles] "${category}" — ${names.length}개 업데이트`);
  }

  console.log("[Coles] 카테고리 업데이트 완료!");
}

async function main() {
  const fromJson = process.argv.includes("--from-json");
  const fixCats = process.argv.includes("--fix-categories");

  let unique: ParsedProduct[];

  if (fromJson) {
    if (!fs.existsSync(DUMP_PATH)) {
      console.error(`[Coles] dump 파일 없음: ${DUMP_PATH}`);
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(DUMP_PATH, "utf-8")) as ParsedProduct[];
    unique = deduplicate(raw);
    console.log(`[Coles] dump 파일 로드: ${raw.length}개 → 중복 제거 후 ${unique.length}개`);
  } else {
    const allProducts = await collect();
    unique = deduplicate(allProducts);
    console.log(`[Coles] 총 ${allProducts.length}개 수집, 중복 제거 후 ${unique.length}개`);

    fs.writeFileSync(DUMP_PATH, JSON.stringify(unique, null, 2));
    console.log(`[Coles] dump 파일 저장 완료: ${DUMP_PATH}`);
  }

  if (fixCats) {
    await fixCategories(unique);
  } else {
    await saveToDb(unique);
  }

  await prisma.$disconnect();
  await _browser?.close();
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect();
  await _browser?.close();
  process.exit(1);
});
