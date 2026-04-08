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
| Auth (post-MVP) | NextAuth.js | OAuth + session handling |

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

### Key DB Models
- `Product` — weekly special item (store, name, brand, category, unit, originalPrice, salePrice, discountPercent, validFrom, validTo)
- `User` — added post-MVP with NextAuth
- `Favorite` — join table between User and Product category/name patterns
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

### MVP (Build in this order)
- [x] **0. Project setup** — Next.js + Prisma + Neon DB connected
- [ ] **1. Data pipeline** — Woolworths scraper script + GitHub Actions cron + DB upsert
- [ ] **2. Weekly deals page** — product grid, category filter, store badge
- [ ] **3. Search** — filter by name, show only discounted items
- [ ] **4. Favorites** — localStorage-based save/unsave, favorites page

### Phase 2 (after MVP is live)
- [ ] **5. Coles integration** — add Coles fetcher, price comparison UI unlocks automatically
- [ ] **6. User auth** — NextAuth.js, migrate favorites to DB
- [ ] **7. Cart comparison** — add items to cart, compare total at Woolworths vs Coles
- [ ] **8. Personalized recommendations** — based on favorites/categories, "this week's deals for you"
- [ ] **9. Price history** — graph price changes over time, surface "real deal" badge
- [ ] **10. Notifications** — email/push when favorited item goes on sale

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
