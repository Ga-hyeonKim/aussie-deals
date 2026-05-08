<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Agent Context — AussieDeals

This project is a **learning project** for an ECU CS student. Prefer explaining *why* over just providing code. Ask before implementing non-trivial features.

## Key constraints

- **Mobile-first**: primary use is on a phone in-store. When desktop and mobile UX conflict, mobile wins. Tap targets must be ≥ 44px.
- **Vercel free tier**: image optimization is disabled on all product images (`unoptimized` prop). Do not re-enable it — ~77K products would exhaust the 5K/month cap in one page load.
- **Scrapers run on GitHub Actions, not Vercel**: Woolworths and Coles block AWS IP ranges. Never suggest moving scrapers to Vercel serverless or API routes.
- **Neon PostgreSQL connection pool**: limit concurrent DB writes during scraper runs (concurrency ≤ 5). The free tier has a low connection ceiling.

## Architecture you must understand before editing

### Two-table design
- `Product` — weekly specials (salePrice, validFrom, validTo, discountPercent). Scraped Wed cron.
- `StoreProduct` — full catalog (current price, no date). Scraped fortnightly cron.
- Do NOT merge them — specials are time-scoped; catalog entries are always-current.

### Scraper pattern (Coles)
- Uses `playwright-extra` + `puppeteer-extra-plugin-stealth` to bypass Imperva.
- Reads `window.__NEXT_DATA__` after page load (no API reverse-engineering).
- 3-attempt retry with 4s/7s backoff on Imperva challenge detection.
- Saves intermediate dump JSON; `--from-json` flag re-uses it without re-scraping.

### Auth
- NextAuth v5, Google OAuth, JWT sessions (30-day maxAge). No session table.
- Favorites: localStorage (logged out) → DB (logged in), auto-merged on first login.

### ON SALE badge
- Favorited `StoreProduct` is matched to current `Product` by store + name.
- `normalizedName` (planned) will generalize this cross-store.

## File map

```
app/
  page.tsx                   Home: weekly specials grid
  search/page.tsx            Full-text search across StoreProduct
  product/[id]/page.tsx      Weekly special detail + price history
  store-product/[id]/page.tsx  Catalog product detail
  favorites/page.tsx         User watchlist
  cart/page.tsx              Cart (this week's specials only)
  api/                       Route handlers (products, store-products, favorites, cart, price-history)

components/
  DealsGrid.tsx              Paginated specials grid
  ProductCard.tsx            Deal card (sale price, discount badge, favorite/cart buttons)
  FilterBar.tsx              Category + discount % filters
  PriceHistoryChart.tsx      Recharts price graph (early stage)

scripts/
  fetch-woolworths.ts        Woolworths specials scraper
  fetch-woolworths-all.ts    Woolworths full catalog scraper (~53K products)
  fetch-coles.ts             Coles specials scraper
  fetch-coles-all.ts         Coles full catalog scraper (~24K products, 16 categories)

.github/workflows/
  fetch-woolworths-specials.yml
  fetch-woolworths-catalog.yml
  fetch-coles-specials.yml
  fetch-coles-catalog.yml
```

## What's in progress (do not claim as complete)

- Price history graph (`PriceHistoryChart.tsx`) — early/incomplete
- Coles full catalog first GitHub Actions run — needs verification
