# AussieDeals

Weekly grocery deals aggregator for Woolworths & Coles (AU). Shows this week's specials, tracks price history, and lets you build a shopping cart — mobile-first, designed for in-store use.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL via Neon |
| ORM | Prisma 7 |
| Hosting | Vercel |
| Scraper runner | GitHub Actions (cron) |
| Charts | Recharts |
| Auth | NextAuth.js v5 (Google OAuth) |

## Local Development

```bash
npm install
npm run dev
```

Requires a `.env` file with:
```
DATABASE_URL=
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

## DB Commands

```bash
npx prisma db push          # sync schema to DB (dev only)
npx prisma studio           # visual DB browser
npx prisma generate         # after schema changes
```

## Architecture

Woolworths & Coles block direct HTTP from AWS (Vercel serverless). All scraping runs on GitHub Actions using Playwright stealth.

```
GitHub Actions (cron)
  ├── fetch-woolworths-specials.yml   every Wednesday
  ├── fetch-coles-specials.yml        every Wednesday +30min
  ├── fetch-woolworths-catalog.yml    every other Monday
  └── fetch-coles-catalog.yml         every other Monday +1h

Vercel → reads Neon PostgreSQL → serves Next.js UI + API routes
```

### Data model

| Table | What it holds |
|-------|--------------|
| `Product` | Weekly specials — salePrice, discountPercent, validFrom/To |
| `StoreProduct` | Full catalog — current price, no date scope |
| `PriceHistory` | Per-product price log for history graphs |
| `Favorite` | User watchlist → StoreProduct |
| `CartItem` | User cart → Product (this week's deals only) |

## Manual Scraper Runs

```bash
npx tsx scripts/fetch-woolworths.ts
npx tsx scripts/fetch-woolworths-all.ts
npx tsx scripts/fetch-woolworths-all.ts --from-json

npx tsx scripts/fetch-coles.ts
npx tsx scripts/fetch-coles-all.ts
npx tsx scripts/fetch-coles-all.ts --from-json
```
