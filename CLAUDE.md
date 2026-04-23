# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AussiDeals** (working title) — A weekly grocery deals aggregator for Australian supermarkets (Woolworths & Coles), focused on helping users actually save money while shopping, not just listing discounts.

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
| Auth (post-MVP) | NextAuth.js v5 | OAuth + session handling |

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

# Run data fetcher manually (local dev)
npx tsx scripts/fetch-woolworths.ts
```

## Architecture

### Why the pipeline is split across two services

Woolworths' API requires an active browser session — direct HTTP calls are blocked. Playwright (a headless browser) is needed to establish a session and then call the API from within the page context. Vercel's serverless functions cannot run a browser, so the scraper runs separately on GitHub Actions.

```
GitHub Actions (cron: every Wednesday)
  └── runs Playwright scraper
  └── upserts products into Neon PostgreSQL

Vercel (Next.js app)
  └── reads from Neon PostgreSQL
  └── serves UI + API routes
```

### Data Pipeline
- **Scraper entry point**: `scripts/fetch-woolworths.ts` — standalone script, runs in GitHub Actions
- **Workflow file**: `.github/workflows/fetch-woolworths.yml` — cron schedule, sets env vars, runs script
- Coles: no stable API yet. Do NOT block MVP on this.

The DB schema uses a `Store` enum (`WOOLWORTHS | COLES`) so both stores share the same `Product` table. The comparison UI works automatically once Coles data exists.

### Cross-Store Product Matching
When Coles data becomes available, match same products across stores using a `normalizedName` column on `Product` (lowercase, stripped of brand/size variations) with an index. No join table needed — just WHERE on normalizedName + different store. Cart comparison (7) uses this to show total price at each store.

### Key DB Models
- `Product` — weekly special item (store, name, brand, category, unit, originalPrice, salePrice, discountPercent, validFrom, validTo)
- `User` — added post-MVP with NextAuth
- `Favorite` — watchlist/wishlist items (products user wants to track regardless of current sale status; triggers notifications when on sale)
- `CartItem` — this week's shopping list (on-sale items user plans to buy this trip; acts as in-store checklist)
- `PriceHistory` — append-only log of prices per product for history graphs

### Auth Strategy
- **MVP**: Favorites stored in `localStorage` (no login required)
- **Post-MVP**: Migrate to DB-backed favorites with NextAuth.js (Google/email login)

### Folder Structure
```
app/
  page.tsx                  # Weekly deals home
  search/page.tsx           # Search results
  favorites/page.tsx        # Saved favorites
  api/
    products/               # Product query endpoints (read-only)
components/
  ProductCard.tsx
  FilterBar.tsx
  SearchBar.tsx
lib/
  prisma.ts                 # Prisma client singleton
scripts/
  fetch-woolworths.ts       # Scraper entry point (run via GitHub Actions)
.github/
  workflows/
    fetch-woolworths.yml    # Cron job definition
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
- [ ] **5. Coles integration** — add Coles fetcher, price comparison UI unlocks automatically (blocked: Coles specials page still broken as of 2026-04-17)
- [x] **6. User auth** — NextAuth.js v5, Google OAuth, Prisma adapter, JWT sessions
- [x] **6a. Navbar profile UI** — show Google avatar + name, dropdown menu (Profile, Sign out)
- [x] **6b. Session maxAge** — keep default 30 days (suits weekly shopping cycle)
- [x] **6c. Favorites/Cart split** — separate Favorites (watchlist: track items, get notified on sale) from Cart (this week's shopping list: on-sale items to buy now, in-store checklist). CartItem DB model, cart API, cart page, mobile FAB, navbar icons
- [x] **6d. Favorites localStorage → DB migration** — logged-in users save favorites to DB via Favorite model; localStorage merge on login, API-backed CRUD
- [ ] **6e. Session-based user features** — cross-device sync, remote logout, or login history (builds on session infra for CV-worthy functionality)
- [ ] **6f. Mobile UI polish** — (1) Navbar: Favorites → heart icon to match Search/Cart icons (2) ProductCard: fix heart button overflow on small screens (shrink-0) (3) Category filter: replace horizontal scroll with dropdown/bottom-sheet for mobile (4) Cart: add delete confirmation (bottom-sheet + undo vs modal — compare both) (5) AussieDeals text logo → styled text or SVG logo
- [ ] **7. Cart comparison** — compare Cart total at Woolworths vs Coles (requires Coles data)
- [ ] **8. Preferred stores** — user selects specific store locations (e.g. "Woolies near uni", "Coles near home"); filters deals to only relevant stores. Stored on User profile.
- [ ] **9. Personalized recommendations** — based on favorites/categories/preferred stores, "this week's deals for you"
- [ ] **10. Price history** — graph price changes over time using **Recharts**, surface "real deal" badge. Requires product detail page (`/product/[id]`).
- [ ] **11. Notifications** — email/push when favorited item goes on sale

### Phase 3 (new features)
- [ ] **12. "Real deal" badge** — compare current sale price against price history average to flag genuinely good deals
- [ ] **13. Weekly digest email** — opt-in newsletter with trending items (most favorited by other users), items cheaper than usual, personalised picks. Only for users who subscribe.
- [ ] **14. Share deals** — copy link / share to social (KakaoTalk, etc.) for individual deals
- [ ] **15. PWA** — progressive web app with home screen install for mobile in-store use

## Data Notes

- **Woolworths**: Requires Playwright browser session. Uses `/apis/ui/browse/category` POST endpoint with `isSpecial: true`. Scrapes per category (15 categories). Previously working code exists at `Desktop/au_discount_info/backend/src/scrapers/woolworths.js`.
- **Coles**: No stable unofficial API as of project start. Revisit with network tab inspection. Do NOT block MVP on this.
- Weekly specials update every **Wednesday** in Australia (AEST)
- Products are scoped by `validFrom`/`validTo` dates — always filter by current week when displaying

## Learning Goals Tracker

This project is designed to build real-world skills in:
- Next.js App Router (server components, API routes, caching)
- PostgreSQL + Prisma (schema design, migrations, relations)
- Data pipeline design (cron jobs, upsert patterns, Playwright scraping)
- CI/CD with GitHub Actions (env secrets, scheduled workflows)
- Deployment on Vercel (env vars, serverless functions)
- Auth patterns (JWT, sessions, OAuth)
- AI-assisted development & orchestration (using Claude Code effectively)
