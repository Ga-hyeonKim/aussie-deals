# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AussieDeals** — A weekly grocery deals aggregator for Australian supermarkets (Woolworths & Coles), focused on helping users actually save money while shopping, not just listing discounts.

**Primary purpose**: Learning project. The developer is a bootcamp graduate (6 months, JS/Python/React/MySQL) and ECU Computer Science student (Year 1). Every technical decision should maximize learning value — prefer industry-standard tools over convenience shortcuts, and explain the *why* behind architectural choices.

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 14+ (App Router) | Full-stack in one project (UI + API routes) |
| Database | PostgreSQL (hosted on Neon) | Industry standard, free tier via Neon |
| ORM | Prisma 7 | Type-safe queries, great DX with TypeScript |
| Web app hosting | Vercel | Best-in-class Next.js deployment |
| Scraper runner | GitHub Actions (cron) | Supports Playwright; Vercel serverless cannot run a browser |
| Charts | Recharts | Native React components, lightweight, SSR-friendly with "use client" |
| Auth | NextAuth.js v5 | OAuth + session handling |

## Commands

```bash
# Dev server
npm run dev

# Prisma: sync schema to DB (dev only — use migrate in prod)
npx prisma db push

# Prisma: open DB GUI
npx prisma studio

# Prisma: generate client after schema changes
npx prisma generate

# Run weekly specials scraper manually
npx tsx scripts/fetch-woolworths.ts

# Run full catalog scraper (all 15 categories, ~53K products → StoreProduct table)
cd scripts && npx tsx fetch-woolworths-all.ts

# Re-run only DB save (if collection succeeded but DB failed)
cd scripts && npx tsx fetch-woolworths-all.ts --from-json
```

## Architecture

### Why the pipeline is split across two services

Woolworths' API requires an active browser session — direct HTTP calls are blocked. Playwright (a headless browser) is needed to establish a session and then call the API from within the page context. Vercel's serverless functions cannot run a browser, so the scraper runs separately on GitHub Actions.

```
GitHub Actions
  ├── fetch-woolworths.yml      (cron: every Wednesday)
  │     └── Playwright → upserts weekly specials → Product table
  ├── fetch-woolworths-all.yml  (cron: every other Monday)
  │     └── Playwright → upserts full catalog  → StoreProduct table
  └── fetch-coles.yml           (cron: every Wednesday, +30min stagger)
        └── HTTP fetch (no Playwright) → upserts weekly specials → Product + StoreProduct tables

Vercel (Next.js app)
  └── reads from Neon PostgreSQL
  └── serves UI + API routes
```

### Data Pipeline
- `scripts/fetch-woolworths.ts` — weekly specials scraper (isSpecial: true)
- `scripts/fetch-woolworths-all.ts` — full catalog scraper (all 15 categories, ~53K products)
  - Saves intermediate `scripts/woolworths-dump.json` after collection (before DB save)
  - Supports `--from-json` flag to retry DB save without re-collecting
- `scripts/fetch-coles.ts` — Coles weekly specials scraper (no Playwright — uses Next.js `/_next/data/{buildId}` endpoint)
  - Fetches buildId from homepage, paginates `on-special.json`, batch upserts to DB
  - Saves intermediate `scripts/coles-dump.json`, supports `--from-json` flag
  - Also upserts to StoreProduct (since no full catalog scraper yet)
- `scripts/` is excluded from `tsconfig.json` (Next.js build only)

### Two-table product design

| Table | Purpose | Populated by |
|-------|---------|-------------|
| `Product` | Weekly specials only (has salePrice, validFrom/To, discountPercent) | fetch-woolworths.ts + fetch-coles.ts (weekly) |
| `StoreProduct` | Full permanent catalog (current price, no validity window) | fetch-woolworths-all.ts (bi-weekly) + fetch-coles.ts (weekly, specials only) |

`Favorite` links to `StoreProduct` — users watch products regardless of sale status. When a favorited `StoreProduct` matches a current `Product` (same store+name), the favorites page shows an ON SALE badge.

`CartItem` links to `Product` — cart is scoped to this week's deals only.

### Cross-Store Product Matching
When Coles data becomes available, match same products across stores using a `normalizedName` column on `Product` (lowercase, stripped of brand/size variations) with an index. No join table needed — just WHERE on normalizedName + different store. Cart comparison (7) uses this to show total price at each store.

### Key DB Models
- `Product` — weekly special (store, name, brand, category, unit, originalPrice, salePrice, discountPercent, imageUrl, validFrom, validTo)
- `StoreProduct` — permanent catalog item (store, name, brand, category, unit, price, imageUrl). ~53K Woolworths products as of 2026-04-23
- `User` — NextAuth user (Google OAuth)
- `Favorite` — watchlist: User → StoreProduct. Shown with ON SALE badge if currently in Product table
- `CartItem` — this week's shopping list: User → Product

### DB Indexes (manually applied in Neon SQL Editor)
```sql
-- Fast name search on favorites page (pg_trgm extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS store_products_name_trgm_idx
  ON store_products USING GIN (name gin_trgm_ops);
```

### Auth Strategy
- Google OAuth via NextAuth.js v5
- JWT sessions, 30-day maxAge
- Favorites: localStorage for logged-out users, DB for logged-in users
- On first login: localStorage favorites auto-merge into DB

### Folder Structure
```
app/
  page.tsx                    # Weekly deals home
  search/page.tsx             # Search results
  favorites/page.tsx          # Watchlist — search catalog + saved items with ON SALE status
  cart/page.tsx               # This week's shopping list
  api/
    products/                 # Weekly specials query (includes storeProductId lookup)
    favorites/                # Favorites CRUD — accepts storeProductId or productId
    store-products/           # StoreProduct search (q= param, used by favorites search bar)
    cart/                     # Cart CRUD
components/
  ProductCard.tsx             # Deal card with FavoriteButton + CartButton
  FavoriteButton.tsx          # Heart toggle — storeProductId if available, else productId fallback
  FilterBar.tsx               # Mobile: <select> dropdown / Desktop: pill buttons
  Navbar.tsx                  # Logo (AussieDeals_LOGO.png) + nav icons + profile dropdown
hooks/
  useFavorites.tsx            # Favorites state — DB when logged in, localStorage when not
  useCart.tsx                 # Cart state
lib/
  prisma.ts                   # Prisma client singleton
scripts/
  fetch-woolworths.ts         # Weekly specials scraper
  fetch-woolworths-all.ts     # Full catalog scraper (--from-json flag)
  woolworths-dump.json        # Intermediate dump (gitignored ideally)
.github/
  workflows/
    fetch-woolworths.yml      # Weekly specials cron
    fetch-woolworths-all.yml  # Full catalog cron (every other Monday)
public/
  AussieDeals_LOGO.png        # Custom logo (cart + AU map + % tag)
prisma/
  schema.prisma
```

## Feature Roadmap

### MVP (Complete)
- [x] **0. Project setup** — Next.js + Prisma + Neon DB connected
- [x] **1. Data pipeline** — Woolworths scraper script + GitHub Actions cron + DB upsert
- [x] **2. Weekly deals page** — product grid, category filter, store badge
- [x] **3. Search** — filter by name, show only discounted items
- [x] **4. Favorites** — localStorage-based save/unsave, favorites page

### Phase 2 (in progress)
- [x] **5a. Coles weekly specials** — `fetch-coles.ts` via Next.js `/_next/data` endpoint (no Playwright). ~7K specials/week.
- [ ] **5b. Coles full catalog** — `fetch-coles-all.ts` (same endpoint, browse categories). ~29.5K products.
- [x] **6. User auth** — NextAuth.js v5, Google OAuth, Prisma adapter, JWT sessions
- [x] **6a. Navbar profile UI** — Google avatar + name, dropdown (Sign out)
- [x] **6b. Session maxAge** — 30 days default
- [x] **6c. Favorites/Cart split** — Favorites = watchlist (StoreProduct), Cart = this week's checklist (Product). CartItem model, cart API, cart page, mobile FAB, navbar icons
- [x] **6d. Favorites localStorage → DB** — DB-backed for logged-in users, localStorage merge on login
- [x] **6e. Cross-device sync** — automatic via 6d (same Google account = same DB favorites)
- [x] **6f. Mobile UI polish**
  - [x] Navbar: Favorites text → heart SVG icon
  - [x] ProductCard: heart button `shrink-0` overflow fix
  - [x] Category filter: `<select>` dropdown on mobile, pill buttons on desktop
  - [x] Cart: immediate delete + 3s undo toast (no modal)
  - [x] Logo: custom `AussieDeals_LOGO.png` (cart + AU map + % tag, cute bubbly style)
- [x] **Full product catalog** — `fetch-woolworths-all.ts` scrapes all 15 categories (~53K unique products) into `StoreProduct` table. Runs bi-weekly via GitHub Actions.
- [x] **Favorites search** — search bar on favorites page queries `StoreProduct` via `/api/store-products`. ON SALE badge when favorited item matches current weekly deal.
- [ ] **7. Cart comparison** — compare Cart total at Woolworths vs Coles (requires Coles data)
- [ ] **8. Preferred stores** — user selects specific store locations; filters deals. Stored on User profile.
- [ ] **9. Personalized recommendations** — based on favorites/categories, "this week's deals for you"
- [ ] **10. Price history** — graph price changes over time using Recharts. Requires product detail page (`/product/[id]`) and `PriceHistory` model.
- [ ] **11. Notifications** — email/push when favorited StoreProduct appears in weekly deals

### Phase 3 — Cross-store UX (Coles + Woolworths 통합)

#### Cart 스토어 분리
- [x] **Cart A. Tab-based store separation** — Cart 페이지에 Woolworths / Coles 탭. 탭별 아이템 목록 + 소계 표시.
- [ ] **Cart B. Comparison view** (Cart A 이후) — 같은 상품을 양쪽 스토어에 나란히 표시. 총합 비교로 어느 마트가 더 저렴한지 한눈에. normalizedName 매칭 완성 후 구현.

#### Favorites 크로스스토어 통합
- [ ] **Favorites A. normalizedName 매칭** — `StoreProduct`에 `normalizedName` 컬럼 추가 (소문자, 브랜드/사이즈 제거). `Favorite`을 `storeProductId` 기반 → `normalizedName` 기반으로 변경. 하트 한 번으로 양쪽 스토어 커버.
  - 스키마 변경: `Favorite` 모델에 `normalizedName String` 추가, `storeProductId` 제거 또는 옵셔널
  - 스크래퍼에서 저장 시 normalizedName 자동 계산 (brand 제거, 소문자, 특수문자 제거)
  - 이미 `pg_trgm` 인덱스 있음 → 유사도 매칭에 활용 가능
- [ ] **Favorites B. 통합 카드 UI** — Favorites 페이지에서 하나의 카드에 Woolworths + Coles 가격/세일 상태 동시 표시. `"Twix: Woolworths $4.00 (ON SALE) | Coles $3.50"`

#### 기타
- [ ] **16. "Real deal" badge** — compare salePrice vs PriceHistory average to flag genuinely good deals
- [ ] **17. Weekly digest email** — opt-in newsletter with trending/cheaper-than-usual/personalised picks
- [ ] **18. Share deals** — copy link / KakaoTalk share for individual deals

## Data Notes

- **Woolworths weekly specials**: `isSpecial: true` in `/apis/ui/browse/category` POST. Updates every Wednesday (AEST). Scoped by `validFrom`/`validTo`.
- **Woolworths full catalog**: same endpoint with `isSpecial: false`. ~53K unique products across 15 categories (Beauty/Personal Care/Baby/Pet each ~12K). Takes ~40 min to scrape.
- **Coles weekly specials**: Next.js `/_next/data/{buildId}/en/on-special.json` endpoint. No Playwright needed. ~7K specials. buildId changes on each Coles deployment — fetched fresh at scraper start. `pricing.was > 0` = real discount, `pricing.was == 0` = MULTI_SAVE bundle deal (originalPrice/discountPercent stored as null).
- Always filter `Product` by current date when displaying deals.
- `StoreProduct` has no date scope — it's a permanent catalog.

## Learning Goals Tracker

- Next.js App Router (server components, API routes, caching)
- PostgreSQL + Prisma (schema design, migrations, relations)
- Data pipeline design (cron jobs, upsert patterns, Playwright scraping)
- CI/CD with GitHub Actions (env secrets, scheduled workflows)
- Deployment on Vercel (env vars, serverless functions)
- Auth patterns (JWT, sessions, OAuth, localStorage→DB migration)
- AI-assisted development & orchestration (using Claude Code effectively)
