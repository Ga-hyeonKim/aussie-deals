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
  `;
  return rows.map((r) => ({ id: r.id, normalizedName: r.normalized_name }));
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
  await prisma.$executeRawUnsafe(
    `UPDATE store_products AS sp
     SET embedding = data.vec::vector
     FROM unnest($1::text[], $2::text[]) AS data(id, vec)
     WHERE sp.id = data.id`,
    idArray,
    vecArray
  );
}

async function main() {
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

  console.log(
    `[Embed] 완료: ${processed}개 (총 ${fmt(Date.now() - startTime)})`
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
