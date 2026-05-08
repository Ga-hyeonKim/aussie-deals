# Architecture Decisions — AussieDeals

## Two-table design: Product + StoreProduct
- `Product`: weekly specials — has `validFrom`, `validTo`, `salePrice`, `discountPercent`
- `StoreProduct`: permanent catalog — current price, no date scope
- **Why:** specials are time-scoped; catalog prices are always-current. One table would require complex expiry logic and pollute the catalog view with stale sale data.

## Playwright on GitHub Actions (not Vercel)
- Woolworths and Coles block direct HTTP from AWS IPs (Vercel serverless)
- Playwright stealth runs on GitHub Actions cron instead
- **Why:** browser automation bypasses CDN/bot detection that blocks raw HTTP. Vercel serverless can't run a browser anyway.

## Coles: Playwright stealth + __NEXT_DATA__
- `playwright-extra` + `puppeteer-extra-plugin-stealth` to bypass Imperva challenge
- Read `window.__NEXT_DATA__` after page load — no API reverse-engineering
- 3-attempt retry with 4s/7s backoff
- **Why:** Coles is a Next.js app; __NEXT_DATA__ exposes all product data cleanly after a real browser load.

## Vercel image optimization: all `unoptimized`
- Free tier cap: 5,000 transformations/month
- ~77K products with images would hit this in one page load
- **Why:** cost control. Raw CDN URLs still load; just no Next.js resize/WebP conversion.

## Auth: JWT sessions (not DB sessions)
- NextAuth v5 JWT strategy, 30-day maxAge
- **Why:** no session table polling, simpler setup, fits small-scale single-user app.

## Favorites: localStorage (logged out) → DB (logged in)
- Auto-merge on first login
- **Why:** unauthenticated users can still use the watchlist; data isn't lost on login.

## DB: Neon PostgreSQL (not SQLite or PlanetScale)
- **Why:** Vercel-native integration, free tier sufficient for ~77K products, supports pg_trgm for fuzzy product name search.

## canonicalBrand: rule-based (LLM 불필요)
- 소문자 변환, 하이픈→공백, 상표기호/아포스트로피/후행구두점 제거
- **Why:** 1,315 유사쌍 분석 결과 전부 포맷 차이(대소문자, 하이픈, 특수문자)였고 의미적 판단이 필요한 케이스 없음. LLM 비용·복잡도 대비 규칙만으로 충분.

## 크로스스토어 매칭 전략: canonicalBrand + pg_trgm (normalizedName 컬럼 병행)
- 쿼리 시점에 `canonicalBrand` 일치 + `normalizedName` pg_trgm 유사도 > 0.7로 판단
- **Why:** 알림과 찜 목록 배지가 같은 파이프라인의 두 출력. normalizedName 저장 컬럼이 있어야 찜 목록 페이지 로드 시 크로스스토어 배지를 빠르게 표시 가능.
