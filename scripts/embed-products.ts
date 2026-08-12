import { config } from "dotenv";
import path from "path";
config({ path: path.join(__dirname, "../.env") });

import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../app/generated/prisma/client";
import OpenAI from "openai";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const EMBED_MODEL = "text-embedding-3-small";
const DIMENSIONS = 256;
const BATCH_SIZE = 500; // OpenAI allows up to 2048 inputs per request

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

/**
 * Only products whose brand exists in BOTH stores.
 *
 * match-products.ts joins on `w.canonical_brand = c.canonical_brand`, so a
 * brand that only one store carries can never produce a match no matter how
 * good its embedding is. Embedding those rows costs money and storage and buys
 * nothing — measured Aug 2026 at 62,576 of 98,805 rows (63%), which is what
 * pushed the database over Neon's 512MB limit in the first place.
 */
async function getUnembeddedProducts(): Promise<
  { id: string; normalizedName: string }[]
> {
  const rows = await prisma.$queryRaw<
    { id: string; normalized_name: string }[]
  >`
    SELECT id, normalized_name
    FROM store_products
    WHERE normalized_name IS NOT NULL
      AND embedding IS NULL
      AND canonical_brand IN (
        SELECT canonical_brand
        FROM store_products
        WHERE canonical_brand IS NOT NULL
        GROUP BY canonical_brand
        HAVING count(DISTINCT store) = 2
      )
  `;
  return rows.map((r) => ({ id: r.id, normalizedName: r.normalized_name }));
}

/** What the run would cost and cover, without calling OpenAI. */
async function report(): Promise<void> {
  const [stats] = await prisma.$queryRaw<
    { total: bigint; named: bigint; shared_brands: bigint; eligible: bigint }[]
  >`
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE normalized_name IS NOT NULL) AS named,
      (SELECT count(*) FROM (
         SELECT canonical_brand FROM store_products
         WHERE canonical_brand IS NOT NULL
         GROUP BY canonical_brand HAVING count(DISTINCT store) = 2
       ) b) AS shared_brands,
      count(*) FILTER (
        WHERE normalized_name IS NOT NULL
          AND canonical_brand IN (
            SELECT canonical_brand FROM store_products
            WHERE canonical_brand IS NOT NULL
            GROUP BY canonical_brand HAVING count(DISTINCT store) = 2
          )
      ) AS eligible
    FROM store_products
  `;
  const pending = await getUnembeddedProducts();
  // ~4 chars per token is close enough for a cost estimate on short names.
  const chars = pending.reduce((n, p) => n + p.normalizedName.length, 0);
  const tokens = Math.ceil(chars / 4);
  const USD_PER_1M = 0.02;

  console.log(`상품 전체:              ${Number(stats.total).toLocaleString()}`);
  console.log(`normalized_name 있음:   ${Number(stats.named).toLocaleString()}`);
  console.log(`양쪽 매장 공통 브랜드:  ${Number(stats.shared_brands).toLocaleString()}`);
  console.log(`매칭 가능 = 임베딩 대상: ${Number(stats.eligible).toLocaleString()} ` +
              `(${((Number(stats.eligible) / Number(stats.named)) * 100).toFixed(1)}%)`);
  console.log(`이번 실행에서 만들 것:  ${pending.length.toLocaleString()}`);
  console.log(`예상 토큰:              ~${tokens.toLocaleString()}`);
  console.log(`예상 비용:              ~$${((tokens / 1_000_000) * USD_PER_1M).toFixed(4)}`);
  console.log(`예상 저장 공간:         ~${((pending.length * 1032) / 1024 / 1024).toFixed(0)}MB`);
}

async function embedBatch(
  texts: string[]
): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
    dimensions: DIMENSIONS,
  });
  return res.data.map((d) => d.embedding);
}

async function saveEmbeddings(
  ids: string[],
  embeddings: number[][]
): Promise<void> {
  const idArray = ids;
  const vecArray = embeddings.map((e) => `[${e.join(",")}]`);
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE store_products AS sp
     SET embedding = data.vec::vector
     FROM unnest($1::text[], $2::text[]) AS data(id, vec)
     WHERE sp.id = data.id`,
    idArray,
    vecArray
  );
  // Count what the database actually stored, not what we sent it.
  if (updated !== ids.length) {
    throw new Error(`batch wrote ${updated} rows, expected ${ids.length}`);
  }
}

async function main() {
  if (process.argv.includes("--dry-run")) {
    await report();
    console.log("\n--dry-run: OpenAI 호출 없음.");
    return;
  }

  console.log("[Embed] 임베딩 안 된 상품 조회 중...");
  const products = await getUnembeddedProducts();
  console.log(`[Embed] ${products.length}개 대상`);

  if (products.length === 0) {
    console.log("[Embed] 모든 상품 임베딩 완료 상태. 종료.");
    return;
  }

  const startTime = Date.now();
  let processed = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const texts = batch.map((p) => p.normalizedName);
    const ids = batch.map((p) => p.id);

    const embeddings = await embedBatch(texts);
    await saveEmbeddings(ids, embeddings);

    processed += batch.length;
    const elapsed = Date.now() - startTime;
    const rate = processed / (elapsed / 1000);
    const remaining = (products.length - processed) / rate;
    console.log(
      `[Embed] ${processed}/${products.length} — 경과 ${fmt(elapsed)}, 예상 남은 ${fmt(remaining * 1000)}`
    );
  }

  // Verify against the database rather than trusting the loop counter.
  const [{ stored }] = await prisma.$queryRaw<{ stored: bigint }[]>`
    SELECT count(*) AS stored FROM store_products WHERE embedding IS NOT NULL
  `;
  console.log(
    `[Embed] 완료: ${processed}개 처리 (총 ${fmt(Date.now() - startTime)})`
  );
  console.log(`[Embed] DB에 실제 저장된 임베딩: ${Number(stored).toLocaleString()}개`);
  if (Number(stored) === 0) throw new Error("nothing was stored");
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
