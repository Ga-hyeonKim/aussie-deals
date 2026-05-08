# Changelog — AussieDeals

Format: significant user-facing or architecture changes only.

## [In progress]
- normalizedName cross-store matching
- 세일 감지 파이프라인 (찜 목록 배지 + 푸시 알림)
- Price history graph (Recharts)
- "Real deal" badge

## 2026-04-30
- Coles full catalog scraper: Playwright stealth, 16 categories, ~24K products → StoreProduct
- Coles specials: Playwright stealth + __NEXT_DATA__ (replaced fragile buildId/HTTP approach)
- GitHub Actions: unified workflow naming (fetch-{store}-{specials|catalog}.yml)

## 2026-04-28
- Woolworths catalog: fixed 120min timeout, reduced Neon concurrency to avoid connection pool exhaustion
- Store-product page: regular price display fix, PriceHistory error logging

## 2026-04-25
- Load more pagination fix
- Discount filter fix
- Cart badge count fix
- Favorites price display fix

## 2026-04-18
- Google OAuth login/logout (NextAuth v5)
- Profile dropdown: avatar, name, email, sign out
- Favorites auto-merge: localStorage → DB on first login
- CartItem model: separate cart from watchlist

## 2026-04 (earlier)
- Woolworths full catalog scraper (~53K products → StoreProduct)
- Product images: all set to `unoptimized` (Vercel free tier 5K limit)
- PWA: home-screen installable
- Initial MVP: Woolworths specials, product search, category/discount filters
