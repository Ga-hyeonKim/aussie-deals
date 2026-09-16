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
 * Bring the database back under Neon's 512MB limit by deleting what nothing
 * reads, then rewriting the two tables that hold the space.
 *
 * Why this exists: on 2026-09-08 the limit was hit again and every write since
 * has failed with `could not extend file because project size limit (512 MB)
 * has been exceeded`. The scrapers kept parsing fine — only the DB writes died,
 * which is why the site stayed up while showing zero current deals.
 *
 * What is safe to delete, and why:
 *   - `Product` older than RETAIN_DAYS. Every read site filters
 *     `validFrom <= now <= validTo`, so past weeks are write-only data. The two
 *     exceptions are deep links to `/product/[id]` (already-expired deals, now
 *     404) and expired `cart_items`, which cascade away.
 *   - `price_history` rows whose neighbours on both sides hold the same price.
 *     Dropping a run's interior keeps its endpoints, so a line chart is
 *     unchanged: ten weeks at $5.00 render the same from two points as from ten.
 *     Deleting every row equal to its predecessor would be ~21% cheaper but
 *     loses each run's closing point, which does move the line.
 *
 * The order is not cosmetic, same lesson as scripts/reclaim-space.ts (Aug 2026).
 * VACUUM FULL writes a second copy before dropping the original, so rewriting
 * price_history at 267MB would peak at ~544MB and fail. Its 124MB primary key
 * is dropped first to buy the headroom, and rebuilt at the end.
 *
 * Rerunnable: every step is guarded, so a failure part-way can be resumed by
 * running the script again.
 */
const MB = 1024 * 1024;
const RETAIN_DAYS = 28;

/** Bigint counts out of the pg catalogue — read through `Number()`. */
type RawRow = Record<string, string | bigint | number | null>;

async function size() {
  const [r] = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT pg_database_size(current_database()) AS bytes`
  );
  return Number(r.bytes) / MB;
}

async function step(label: string, run: () => Promise<number | void>) {
  const before = await size();
  const t = Date.now();
  const rows = await run();
  const after = await size();
  const delta = after - before;
  const count = typeof rows === "number" ? `${rows} rows  ` : "";
  console.log(
    `${label.padEnd(46)} ${count}${before.toFixed(0)}MB → ${after.toFixed(0)}MB ` +
    `(${delta >= 0 ? "+" : ""}${delta.toFixed(0)}MB, ${((Date.now() - t) / 1000).toFixed(1)}s)`
  );
}

async function hasPrimaryKey(table: string) {
  const [r] = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT count(*) AS n FROM pg_constraint
     WHERE conrelid = $1::regclass AND contype = 'p'`, table
  );
  return Number(r.n) > 0;
}

/**
 * Delete the interior of every flat run, one hash bucket of products at a time.
 * The bucket filter sits inside the window subquery: the window partitions by
 * store_product_id, so a product's whole series lands in one bucket and no run
 * is ever split across batches. A single 716K-row DELETE is one transaction
 * whose WAL Neon would also have to store.
 */
const BUCKETS = 32;

async function pruneBucket(i: number) {
  return prisma.$executeRawUnsafe(
    `DELETE FROM price_history ph
     USING (
       SELECT store_product_id AS sid, "recordedAt" AS ts
       FROM (
         SELECT store_product_id, "recordedAt", price,
                lag(price)  OVER w AS prev,
                lead(price) OVER w AS nxt
         FROM price_history
         WHERE abs(hashtext(store_product_id) % ${BUCKETS}) = $1
         WINDOW w AS (PARTITION BY store_product_id ORDER BY "recordedAt")
       ) t
       WHERE prev IS NOT NULL AND nxt IS NOT NULL
         AND price = prev AND price = nxt
     ) d
     WHERE ph.store_product_id = d.sid AND ph."recordedAt" = d.ts`, i
  );
}

async function main() {
  const start = await size();
  console.log(`start: ${start.toFixed(0)}MB of 512MB (${(512 - start).toFixed(0)}MB free)\n`);

  await step(`1. delete Product older than ${RETAIN_DAYS}d`, () =>
    prisma.$executeRawUnsafe(
      `DELETE FROM "Product" WHERE "validTo" < now() - interval '${RETAIN_DAYS} days'`));

  // Reclaims the deleted rows and their three indexes. Small enough to rewrite
  // in place: the survivors are ~13% of the table.
  await step("2. VACUUM FULL Product (app pauses)", () =>
    prisma.$executeRawUnsafe(`VACUUM FULL "Product"`));

  // Buys the headroom step 5 needs. Chart queries fall back to a seq scan
  // until step 6 rebuilds it.
  if (await hasPrimaryKey("price_history")) {
    await step("3. drop price_history_pkey (charts slow)", () =>
      prisma.$executeRawUnsafe(
        `ALTER TABLE price_history DROP CONSTRAINT price_history_pkey`));
  } else {
    console.log("3. drop price_history_pkey                       already dropped, skipping");
  }

  let deleted = 0;
  const t4 = Date.now();
  for (let i = 0; i < BUCKETS; i++) {
    deleted += await pruneBucket(i);
    process.stdout.write(`\r4. prune flat runs: bucket ${i + 1}/${BUCKETS}, ${deleted} rows deleted`);
  }
  console.log(`\r4. prune flat runs                             ${deleted} rows  ` +
              `(${((Date.now() - t4) / 1000).toFixed(1)}s)`);

  await step("5. VACUUM FULL price_history (app pauses)", () =>
    prisma.$executeRawUnsafe(`VACUUM FULL price_history`));

  if (await hasPrimaryKey("price_history")) {
    console.log("6. rebuild price_history_pkey                   already present, skipping");
  } else {
    await step("6. rebuild price_history_pkey", () =>
      prisma.$executeRawUnsafe(
        `ALTER TABLE price_history ADD PRIMARY KEY (store_product_id, "recordedAt")`));
  }

  const end = await size();
  console.log(`\nend: ${end.toFixed(0)}MB of 512MB (${(512 - end).toFixed(0)}MB free), ` +
              `reclaimed ${(start - end).toFixed(0)}MB`);
}

main()
  .catch(e => { console.error("FAILED:", e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect());
