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

## 크로스스토어 매칭 전략: canonicalBrand + AI embeddings → ProductGroup table

### Evolution
- Phase 1 (완료): `canonicalBrand` 규칙 기반 정규화 — 81,709행 백필
- Phase 2 (기존 계획): `normalizedName` + pg_trgm 유사도 > 0.7
- Phase 2 (변경): `normalizedName` + embedding cosine similarity → ProductGroup table

### Why embeddings replace pg_trgm for matching
- pg_trgm은 문자열 유사도만 측정 — "Woolworths Homebrand Milk 2L" vs "Coles Own Brand Full Cream Milk 2L"은 유사도가 낮음
- Embedding은 의미적 유사도를 캡처 — 같은 제품이지만 다른 이름도 높은 유사도
- pg_trgm GIN 인덱스는 검색 기능에 계속 사용 (제거 안 함)

### Why ProductGroup table (approach A) over query-time matching
- 찜 목록 페이지 로드 시 매번 벡터 검색하면 느림 (81K × cosine)
- 미리 계산된 매칭 결과를 ProductGroup에 저장 → JOIN으로 즉시 조회
- 매칭이 틀려도 임베딩은 DB에 남아 있으니 threshold만 바꿔서 재생성 가능 (API 비용 0)
- 새 상품은 스크래퍼 실행 시 incremental matching

### University connection
- ECU AI 과목: entity resolution, vector similarity, threshold tuning

## DB: pgvector on Neon (별도 벡터 DB 불필요)
- Neon이 pgvector 확장을 네이티브 지원
- Pinecone/Weaviate 같은 별도 인프라 불필요 — 하나의 DB에서 관계형 + 벡터 쿼리
- **Why:** 스택 단순화. ~81K 벡터는 Neon 무료 티어로 충분.

## ProductGroup: FK(1:N) 방식 (조인 테이블 아님)
- StoreProduct에 `productGroupId` FK 추가, ProductGroup이 여러 StoreProduct를 가짐
- 별도 조인 테이블(N:M) 대신 1:N 선택
- **Why:** 하나의 상품이 여러 그룹에 동시에 속할 유스케이스가 없음. FK가 쿼리 단순 (JOIN 하나 적음) + 모바일 응답 속도에 유리.

## Favorites: 로그인 필수 (localStorage 제거)
- 기존: 비로그인 → localStorage, 로그인 시 DB 병합
- 변경: 비로그인 하트 클릭 → /login 리다이렉트, DB 전용
- **Why:** 데이터 일관성 + 기기 간 동기화 보장. 핵심 플로우(집에서 담기 → 매장에서 보기)가 로그인 전제. localStorage 병합 로직의 엣지 케이스 제거.
