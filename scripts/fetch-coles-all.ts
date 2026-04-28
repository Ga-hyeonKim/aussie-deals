import { config } from "dotenv";
import process from "process";
import fs from "fs";
import path from "path";

config({ path: path.join(__dirname, "../.env") });
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../app/generated/prisma/client";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DUMP_PATH = path.join(__dirname, "coles-all-dump.json");
const BATCH_SIZE = 50;
const PAGE_DELAY_MS = 300;
const COLES_BASE = "https://www.coles.com.au";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, */*",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
};

// 프로모션성 카테고리(Back to School, Down Down 등) 제외 — 일반 상품 카테고리만
const CATEGORIES = [
  { slug: "meat-seafood",          name: "Meat & Seafood" },
  { slug: "fruit-vegetables",      name: "Fruit & Vegetables" },
  { slug: "dairy-eggs-fridge",     name: "Dairy, Eggs & Fridge" },
  { slug: "bakery",                name: "Bakery" },
  { slug: "deli",                  name: "Deli" },
  { slug: "pantry",                name: "Pantry" },
  { slug: "dietary-world-foods",   name: "Dietary & World Foods" },
  { slug: "chips-chocolates-snacks", name: "Chips, Chocolates & Snacks" },
  { slug: "drinks",                name: "Drinks" },
  { slug: "liquorland",            name: "Beer, Wine & Spirits" },
  { slug: "frozen",                name: "Frozen" },
  { slug: "cleaning-laundry",      name: "Cleaning & Laundry" },
  { slug: "health-beauty",         name: "Health & Beauty" },
  { slug: "baby",                  name: "Baby" },
  { slug: "pet",                   name: "Pet" },
  { slug: "home-garden",           name: "Home & Garden" },
];

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

// --- Coles API ---

async function extractBuildId(html: string): Promise<string | null> {
  const match = html.match(/"buildId":"([^"]+)"/);
  return match ? match[1] : null;
}

async function getBuildId(): Promise<string> {
  // /on-special 페이지 시도 — 봇 차단이 홈페이지보다 덜함
  const urls = [`${COLES_BASE}/on-special`, COLES_BASE];
  const navHeaders = {
    "User-Agent": HEADERS["User-Agent"],
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-AU,en;q=0.9",
    "Cache-Control": "max-age=0",
    "Upgrade-Insecure-Requests": "1",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
  };

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: navHeaders });
      const html = await res.text();
      const buildId = await extractBuildId(html);
      if (buildId) return buildId;
    } catch {
      // 다음 URL 시도
    }
  }

  // fallback: curl (다른 TLS 핑거프린트로 봇 차단 우회)
  console.log("[Coles All] fetch 차단됨 — curl로 재시도...");
  const { execSync } = await import("child_process");
  const html = execSync(
    `curl -s --max-time 15 "${COLES_BASE}/on-special" -H "User-Agent: ${HEADERS["User-Agent"]}"`,
    { encoding: "utf8" }
  );
  const buildId = await extractBuildId(html);
  if (!buildId) throw new Error(`[Coles All] buildId 추출 실패 — HTML: ${html.slice(0, 300)}`);
  return buildId;
}

async function fetchCategoryPage(
  buildId: string,
  slug: string,
  page: number
): Promise<{ results: ColesRawProduct[]; noOfResults: number; pageSize: number; assetsUrl: string }> {
  const url = `${COLES_BASE}/_next/data/${buildId}/en/browse/${slug}.json?page=${page}&slug=${slug}`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Referer: `${COLES_BASE}/browse/${slug}` },
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("STALE_BUILD_ID");
    throw new Error(`[Coles All] HTTP ${res.status} — ${slug} page ${page}`);
  }

  const data = await res.json();
  const sr = data?.pageProps?.searchResults;
  if (!sr) throw new Error(`[Coles All] searchResults 없음 — ${slug} page ${page}`);

  return {
    results: sr.results ?? [],
    noOfResults: sr.noOfResults ?? 0,
    pageSize: sr.pageSize ?? 48,
    assetsUrl: data.pageProps?.assetsUrl ?? "https://cdn.productimages.coles.com.au/productimages",
  };
}

function parseProduct(p: ColesRawProduct, category: string, assetsUrl: string): ParsedProduct | null {
  if (!p.name || !p.pricing?.now) return null;

  const name = p.brand ? `${p.brand} ${p.name}` : p.name;

  return {
    name,
    brand: p.brand ?? null,
    category,
    unit: p.size ?? null,
    price: p.pricing.now,
    imageUrl: p.imageUris?.[0]?.uri ? assetsUrl + p.imageUris[0].uri : null,
  };
}

// --- Collection ---

async function fetchCategoryAll(
  buildId: string,
  cat: { slug: string; name: string },
  assetsUrl: string
): Promise<{ products: ParsedProduct[]; buildId: string }> {
  const products: ParsedProduct[] = [];
  const seenIds = new Set<number>();
  let page = 1;
  let totalPages = 1;
  let currentBuildId = buildId;

  while (page <= totalPages) {
    let data;
    try {
      data = await fetchCategoryPage(currentBuildId, cat.slug, page);
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "STALE_BUILD_ID") {
        console.log("[Coles All] buildId 만료 — 재취득 중...");
        currentBuildId = await getBuildId();
        data = await fetchCategoryPage(currentBuildId, cat.slug, page);
      } else {
        throw e;
      }
    }

    if (page === 1) {
      totalPages = Math.ceil(data.noOfResults / data.pageSize);
    }

    for (const raw of data.results) {
      if (raw.id && seenIds.has(raw.id)) continue;
      if (raw.id) seenIds.add(raw.id);
      const parsed = parseProduct(raw, cat.name, assetsUrl);
      if (parsed) products.push(parsed);
    }

    page++;
    if (page <= totalPages) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
  }

  return { products, buildId: currentBuildId };
}

async function collect(): Promise<ParsedProduct[]> {
  console.log("[Coles All] 전체 품목 수집 시작...");

  let buildId = await getBuildId();
  console.log(`[Coles All] buildId: ${buildId.slice(0, 30)}...`);

  // assetsUrl은 첫 번째 카테고리 응답에서 추출
  const firstPage = await fetchCategoryPage(buildId, CATEGORIES[0].slug, 1);
  const assetsUrl = firstPage.assetsUrl;

  const allProducts: ParsedProduct[] = [];

  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const start = Date.now();
    const { products, buildId: updatedBuildId } = await fetchCategoryAll(buildId, cat, assetsUrl);
    buildId = updatedBuildId;
    allProducts.push(...products);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[Coles All] (${i + 1}/${CATEGORIES.length}) ${cat.name}: ${products.length}개 — ${elapsed}s`
    );
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[Coles All] 수집 완료: ${allProducts.length}개`);
  return allProducts;
}

// --- DB Save ---

async function upsertBatch(products: ParsedProduct[]): Promise<void> {
  const results = await Promise.all(
    products.map(async p => {
      const sp = await prisma.storeProduct.upsert({
        where: { store_name: { store: "COLES", name: p.name } },
        update: { brand: p.brand, category: p.category, unit: p.unit, price: p.price, imageUrl: p.imageUrl },
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
      }).catch((e: Error) => {
        console.error(`[Coles All] ${p.name} 저장 실패:`, e.message);
        return null;
      });
      return sp ? { id: sp.id, price: p.price } : null;
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
    console.log(
      `[Coles All] ${saved}/${products.length} — 경과 ${fmt(elapsed)}, 예상 남은 시간 ${fmt(remaining * 1000)}`
    );
  }

  console.log(`[Coles All] DB 저장 완료: ${products.length}개 (총 ${fmt(Date.now() - startTime)})`);
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
}

main().catch(err => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
