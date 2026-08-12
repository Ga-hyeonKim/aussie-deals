# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AussieDeals** — Weekly grocery deals aggregator for Woolworths & Coles (AU). Learning project: bootcamp grad + ECU CS Year 1. Prefer industry-standard tools, explain the *why* behind decisions.

## Invariants

Things that must always hold. Every one of these was learned by shipping the
opposite. **Re-read this list when adding a store, a data source, or a new
dimension** — that is when assumptions from a narrower world quietly expire.

- **A `Product` row does not mean the item is discounted.** Coles lists
  no-discount items on `/on-special`. Use `isRealDeal()` from `lib/deal.ts`;
  never test `if (deal)` alone.
- **`PriceHistory` is an incomplete archive, not a price feed.** Rows are
  missing, duplicated per day, and each store's series ends on a different day.
  Never read the current price from its last row — the page resolves the
  current price and passes it down.
- **Same name does not mean same product.** Size must match too;
  `normalizedName` strips it, so the embedding cannot see it.
- **Coles `MULTI_SAVE` promotions have `originalPrice = null`.** Any code
  reading `originalPrice` must handle null as "no discount known", not "free".

## Working agreements

- **Name assumptions as functions.** `if (currentDeal)` meaning "on sale" is a
  claim with no name, and unnamed claims get copy-pasted. A named predicate is
  one place to correct.
- **Measure before fixing.** Count how many rows are affected and compare
  across stores — an asymmetry (Woolworths 0%, Coles 30%) localises the bug
  faster than reading code does.
- **Run `npm run build` before pushing anything touching `useSearchParams`,
  URL params, or server/client boundaries.** `npm run dev` cannot catch
  prerender errors; it always has a real URL.
- **Log the diagnosis in `DEBUGGING.md` as it happens** — while the numbers are
  still to hand, not at wrap-up. Only cases whose scope was actually measured.
  Write the `**배운 것**` line too, and write it as an interview answer: the
  claim the measurement actually licences, the judgement call behind it, and
  what generalises past this bug. No praise, no restating the fix.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL via Neon |
| ORM | Prisma 7 |
| Hosting | Vercel |
| Scraper runner | GitHub Actions (cron) |
| Charts | Recharts |
| Auth | NextAuth.js v5 |

## Commands

```bash
npm run dev
npx prisma db push          # sync schema (dev only)
npx prisma studio           # DB GUI
npx prisma generate         # after schema changes
npx tsx scripts/fetch-woolworths.ts
npx tsx scripts/fetch-woolworths-all.ts          # full catalog (~53K products)
npx tsx scripts/fetch-woolworths-all.ts --from-json
npx tsx scripts/fetch-coles.ts                   # weekly specials
npx tsx scripts/fetch-coles-all.ts               # full catalog (~29K products)
npx tsx scripts/fetch-coles-all.ts --from-json
```

## Architecture

Woolworths & Coles block direct HTTP from AWS — Playwright stealth runs on GitHub Actions (Vercel serverless can't run a browser).

```
GitHub Actions
  ├── fetch-woolworths-specials.yml  (cron: every Wednesday)
  │     └── Playwright → Product table (weekly specials)
  ├── fetch-woolworths-catalog.yml   (cron: every other Monday)
  │     └── Playwright → StoreProduct table (full catalog)
  ├── fetch-coles-specials.yml       (cron: every Wednesday +30min)
  │     └── Playwright stealth + __NEXT_DATA__ → Product + StoreProduct
  └── fetch-coles-catalog.yml        (cron: every other Monday +1h)
        └── Playwright stealth + __NEXT_DATA__ → StoreProduct (16 categories)

Vercel → reads Neon PostgreSQL → serves UI + API routes
```

### Two-table design

| Table | Purpose | Script |
|-------|---------|--------|
| `Product` | Weekly specials (salePrice, validFrom/To, discountPercent) | fetch-*-specials |
| `StoreProduct` | Permanent catalog (current price, no date scope) | fetch-*-catalog |

- `Favorite` → `StoreProduct` (watchlist, store-independent)
- `CartItem` → `Product` (this week's deals only)
- ON SALE badge: favorited StoreProduct matched to current Product by store+name

### Key DB Models
- `Product` — store, name, brand, category, unit, originalPrice, salePrice, discountPercent, imageUrl, validFrom, validTo
- `StoreProduct` — store, name, brand, canonicalBrand, category, unit, price, imageUrl
- `Favorite` — User → StoreProduct
- `CartItem` — User → Product

### DB Indexes (applied manually in Neon SQL Editor)
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS store_products_name_trgm_idx
  ON store_products USING GIN (name gin_trgm_ops);
```

### Auth
- Google OAuth, NextAuth.js v5, JWT sessions (30-day maxAge)
- Favorites: localStorage (logged out) → DB (logged in), auto-merge on first login

### Scraper pattern (Coles)
- Playwright stealth (`playwright-extra` + `puppeteer-extra-plugin-stealth`)
- Navigate per page with `page.goto()`, read `window.__NEXT_DATA__` after `waitUntil: "load"`
- Page 1: `/on-special` or `/browse/{slug}`. Page N: `page.url().split("?")[0] + ?page=N` (preserves /en/ redirect)
- 3-attempt retry with 4s/7s backoff on Imperva challenge
- Intermediate dump (`coles-dump.json`, `coles-all-dump.json`), `--from-json` flag

## Remaining Features

### Planned
- [ ] **Cross-store matching** — AI embeddings (pgvector) + canonicalBrand for product entity resolution → ProductGroup table
- [ ] **Favorites cross-store** — one heart covers both stores via ProductGroup
- [ ] **Notifications** — PWA Web Push when favorited item goes on sale
- [ ] **Cart comparison** — Woolworths vs Coles total via ProductGroup
- [ ] **"Real deal" badge** — salePrice vs PriceHistory avg
- [ ] **Personalized picks** — based on favorites/categories
