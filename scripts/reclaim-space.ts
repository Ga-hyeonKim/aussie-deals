import { config } from "dotenv";
import path from "path";
config({ path: path.join(__dirname, "../.env"), quiet: true });

import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../app/generated/prisma/client";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/**
 * One-off: bring the database back under the Neon 512MB limit so embeddings can
 * be regenerated. See TODO Priority 0.5 H.
 *
 * The order is not cosmetic. Building the new primary key needs ~76MB that does
 * not exist at 490MB, so every index is dropped before anything is built, and
 * VACUUM FULL runs inside that same window — it needs ~88MB of headroom and
 * this is the only moment the database has it.
 *
 * What is reclaimed where:
 *   - DROP INDEX  reclaims immediately.
 *   - VACUUM FULL reclaims the 66MB of dropped `embedding` columns, which are
 *     dead bytes inside live rows that a plain VACUUM cannot touch.
 *   - DROP COLUMN reclaims nothing now; it only stops the column costing ~29
 *     bytes on every future row.
 *
 * Rerunnable: every step is guarded, so a failure part-way can be resumed by
 * running the script again.
 */
const MB = 1024 * 1024;

/** Bigint counts out of the pg catalogue — read through `Number()`, never used arithmetically as-is. */
type RawRow = Record<string, string | bigint | number | null>;

async function size() {
  const [r] = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT pg_database_size(current_database()) AS bytes`
  );
  return Number(r.bytes) / MB;
}

async function step(label: string, sql: string) {
  const before = await size();
  const t = Date.now();
  await prisma.$executeRawUnsafe(sql);
  const after = await size();
  const delta = after - before;
  console.log(
    `${label.padEnd(44)} ${before.toFixed(0)}MB → ${after.toFixed(0)}MB ` +
    `(${delta >= 0 ? "+" : ""}${delta.toFixed(0)}MB, ${((Date.now() - t) / 1000).toFixed(1)}s)`
  );
}

async function main() {
  console.log(`start: ${(await size()).toFixed(0)}MB of 512MB\n`);

  // Guard: the composite primary key can only be created if the pair is already
  // unique. Measured 0 duplicates on 2026-08-11 — verify rather than trust.
  const [dup] = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT count(*) - count(DISTINCT (store_product_id, "recordedAt")) AS n FROM price_history`
  );
  if (Number(dup.n) !== 0) {
    throw new Error(`${dup.n} rows share a (store_product_id, recordedAt) pair — dedupe first`);
  }
  console.log("(store_product_id, recordedAt) is unique — composite PK is safe\n");

  // 1. Never used since stats were reset; queries go via the composite index.
  await step("1. drop price_history_pkey",
    `ALTER TABLE price_history DROP CONSTRAINT IF EXISTS price_history_pkey`);

  // 2. Dropped, not replaced in place: Postgres cannot promote a non-unique
  //    index to a primary key, and building the new one alongside would exceed
  //    512MB. Chart queries fall back to a seq scan until step 4.
  await step("2. drop composite index (chart queries slow until step 4)",
    `DROP INDEX IF EXISTS "price_history_store_product_id_recordedAt_idx"`);

  // 3. The 66MB of dropped embedding columns. Takes an ACCESS EXCLUSIVE lock —
  //    the app cannot read store_products while this runs.
  await step("3. VACUUM FULL store_products (app pauses)",
    `VACUUM FULL store_products`);

  // 4. Replaces both indexes above with one, and gives Prisma a model identity.
  await step("4. add composite primary key",
    `ALTER TABLE price_history ADD PRIMARY KEY (store_product_id, "recordedAt")`);

  // 5. Frees nothing today; stops ~29 bytes per row from here on.
  await step("5. drop price_history.id",
    `ALTER TABLE price_history DROP COLUMN IF EXISTS id`);

  // 6. idx_scan = 2 since the last stats reset.
  await step("6. drop store_products_store_category_idx",
    `DROP INDEX IF EXISTS store_products_store_category_idx`);

  const end = await size();
  console.log(`\nend: ${end.toFixed(0)}MB of 512MB (${(512 - end).toFixed(0)}MB free)`);
  console.log("next: sync prisma/schema.prisma, then `npx prisma db push` must be a no-op");
}

main()
  .catch(e => { console.error("FAILED:", e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect());
