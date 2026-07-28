# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AussieDeals** — Weekly grocery deals aggregator for Woolworths & Coles (AU). Learning project: bootcamp grad + ECU CS Year 1. Prefer industry-standard tools, explain the *why* behind decisions.

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
