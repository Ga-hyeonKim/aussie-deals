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
 * Report what is using the Neon 512MB budget. Run before and after anything
 * that reclaims space — DROP INDEX reclaims immediately, DELETE and DROP COLUMN
 * do not (the bytes stay inside live rows until the table is rewritten).
 */
const n = (v: unknown) => Number(v);

/**
 * A row from the pg catalogue views below. Every column is either text
 * (`::text`, `pg_size_pretty`, `::date`) or a bigint count — never a Prisma
 * model — so the driver hands back bigint, not number. Read counts through
 * `n()` rather than using them arithmetically.
 */
type RawRow = Record<string, string | bigint | number | null>;

async function main() {
  const [db] = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS size,
            pg_database_size(current_database()) AS bytes`
  );
  const LIMIT = 512 * 1024 * 1024;
  console.log(`\nDB total: ${db.size}  (${((n(db.bytes) / LIMIT) * 100).toFixed(1)}% of 512MB, ` +
              `${((LIMIT - n(db.bytes)) / 1024 / 1024).toFixed(0)}MB free)\n`);

  const tables = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT c.relname::text AS relname,
            pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
            pg_size_pretty(pg_table_size(c.oid))          AS tbl,
            pg_size_pretty(pg_indexes_size(c.oid))        AS idx,
            n_live_tup, n_dead_tup
     FROM pg_class c
     JOIN pg_stat_user_tables s ON s.relid = c.oid
     WHERE c.relkind = 'r'
     ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 10`
  );
  console.log("tables");
  console.table(tables.map(t => ({ ...t, n_live_tup: n(t.n_live_tup), n_dead_tup: n(t.n_dead_tup) })));

  const idx = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT indexrelname::text AS indexrelname, relname::text AS relname,
            pg_size_pretty(pg_relation_size(indexrelid)) AS size, idx_scan
     FROM pg_stat_user_indexes
     ORDER BY pg_relation_size(indexrelid) DESC LIMIT 12`
  );
  console.log("indexes (idx_scan = 0 means never used since stats reset)");
  console.table(idx.map(i => ({ ...i, idx_scan: n(i.idx_scan) })));

  const [ph] = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT count(*) AS rows,
            count(DISTINCT (store_product_id, "recordedAt"::date)) AS by_day,
            count(DISTINCT (store_product_id, "recordedAt"))       AS by_timestamp,
            count(DISTINCT store_product_id) AS products,
            min("recordedAt")::date AS first, max("recordedAt")::date AS last
     FROM price_history`
  );
  console.log("price_history");
  console.table([{
    rows: n(ph.rows), products: n(ph.products),
    distinct_by_day: n(ph.by_day), dup_same_day: n(ph.rows) - n(ph.by_day),
    dup_same_timestamp: n(ph.rows) - n(ph.by_timestamp),
    range: `${ph.first} → ${ph.last}`,
  }]);

  const [sp] = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE normalized_name IS NOT NULL) AS with_norm,
            count(*) FILTER (WHERE embedding IS NOT NULL) AS with_embedding
     FROM store_products`
  );
  console.log("store_products", { total: n(sp.total), with_norm: n(sp.with_norm),
                                  with_embedding: n(sp.with_embedding) });

  const dropped = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT attrelid::regclass::text AS tbl, count(*) AS dropped_cols
     FROM pg_attribute WHERE attisdropped AND attrelid::regclass::text NOT LIKE 'pg_%'
     GROUP BY 1 ORDER BY 2 DESC`
  );
  if (dropped.length) {
    console.log("dropped columns still occupying live rows (needs table rewrite)");
    console.table(dropped.map(d => ({ ...d, dropped_cols: n(d.dropped_cols) })));
  }
}

main()
  .catch(e => { console.error("FAILED:", e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect());
