---
name: db-schema
description: Editing prisma/schema.prisma, adding an index or column, running prisma db push or migrate, or touching the pgvector embedding column. Load before changing anything about the database schema.
---

# Database schema

## The trap that already cost 98,595 rows

`store_products.embedding` is declared as `Unsupported("vector(256)")`. Prisma
cannot read or write it, so embed/match go through raw SQL — but **the
declaration must stay in `schema.prisma`**. On 2026-08-12 a `prisma db push
--accept-data-loss` running inside a scraper cron dropped the column and every
vector in it.

The `db push` step is gone from all four scraper workflows as of 2026-08-13.
Do not add it back to any workflow.

## Current state: no migrations

`prisma/migrations/` does not exist. Schema changes are applied by running
`npx prisma db push` locally. `prisma.config.ts` declares a migrations path that
is unused.

**Adopting migrations is a planned step** (`STATE.md` → 다음). The flow when it
happens: `prisma migrate diff` against the live DB to generate a baseline →
`migrate resolve --applied` → `migrate deploy` on release.

Until then: after changing `schema.prisma`, run `npx prisma db push` yourself and
say so — nothing else will apply it.

## DDL that exists in the database but not in the schema

Prisma does not manage these. They survive `db push` but are invisible to it,
and they are the main reason to adopt migrations.

```sql
-- Applied manually in the Neon SQL editor
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS store_products_name_trgm_idx
  ON store_products USING GIN (name gin_trgm_ops);
```

**There is no vector index on `store_products.embedding`.** `match-products.ts`
runs an exact `<=>` scan over a brand-joined nested loop. An `hnsw` index would
need raw SQL; Prisma cannot express it on an `Unsupported` column.

## Known index gaps

Worth knowing before adding a query, and worth fixing when migrations land:

- `Product` browse queries filter on `validFrom`/`validTo` without `store`, so
  the `[store, validFrom, validTo]` index cannot serve them. No index on
  `Product.category` or `discountPercent` (the latter is the `orderBy`).
- `StoreProduct.normalizedName` has no index despite being filtered by
  `embed-products.ts`.
- Cascade-delete targets have no index: `Favorite.storeProductId`,
  `CartItem.productId`, `Account.userId`, `Session.userId`.

## Space

Neon free tier is 512MB and has been hit once (2026-08-11, 185MB reclaimed).
`PriceHistory` is the pressure — it has a composite PK `[storeProductId,
recordedAt]` and no surrogate id, and it still carries duplicate rows per day.

Before proposing a paid tier, remember the archive is incomplete by design.
Storing duplicate rows of an incomplete archive is not worth money. Run
`npx tsx scripts/db-size.ts` to see the current breakdown.
