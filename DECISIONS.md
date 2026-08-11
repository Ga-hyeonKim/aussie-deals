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

## Embedding 차원: 1536 → 256
- OpenAI `text-embedding-3-small`의 `dimensions` 파라미터로 256차원 사용
- **Why:** Neon 무료 티어 512MB 한도. 1536차원은 벡터만 606MB, 256차원은 101MB로 수용 가능. 같은 canonicalBrand 내 비교라 좁은 범위에서 256차원 충분. OpenAI 벤치마크상 성능차 ~1%p.

## 매칭 threshold: 0.95 (보수적 시작)
- 0.85: Tim Tam Mangoes↔Caramel, Cadbury Sticky Toffee↔Raspberry 등 오매칭 다수
- 0.93: Huggies Boys↔Girls, Noshu 97%↔95% 등 여전히 문제
- 0.95: 대부분 올바른 매칭. 일부 이름 표기 차이(Val Verde Passata Sauce↔Cooking Sauce)도 잡힘
- **Why:** 잘못된 ProductGroup은 사용자에게 엉뚱한 상품 보여줌 → 보수적 시작 후 100쌍 라벨링으로 미세 조정. threshold 낮추면 기존 그룹은 유지되고 추가 매칭만 생김.

## 페이지 상태: sessionStorage → URL 파라미터
- Deals는 `?store` `?page` `?category` `?discount`, Favorites 검색은 `?q=`
- `router.replace`로 갱신해 히스토리에 필터 변경이 쌓이지 않게 함
- **Why:** 기존 sessionStorage 방식이 `displayCount`와 스크롤은 저장하면서 `selectedStore`는
  저장하지 않아, 상세 페이지에서 back 하면 항상 알파벳순 첫 매장(Coles)으로 돌아갔음.
  URL에 담으면 브라우저 히스토리가 알아서 복원하고, 링크 공유도 가능해짐.
  load more를 버리지 않고도 해결됨.

## 크로스스토어 상세 페이지 분리 (`/product-group/[id]`)
- 매칭된 상품은 매장별 페이지가 아니라 통합 페이지로 이동
- 매칭 안 된 상품은 기존 `/store-product/[id]` 유지
- **Why:** 검색 결과에서 ProductGroup 단위로 카드를 합치면 어느 쪽이 "대표"가 될지가
  이름 알파벳순으로 정해져 버림. 같은 상품인데 Woolworths 이미지·페이지로만 열리고
  Coles는 가격 숫자로 격하되는 문제. 같다고 판정한 이상 동등하게 보여주는 게 맞음.

## 가격 그래프: 시계열 원자료 → 판정 + 그래프
- 상단에 "Cheapest at X right now" 판정, 하단에 겹친 비교 그래프 + 저가 기준선
- **Why:** PriceHistory 실측 결과 **49%가 가격 변동 0회, 76%가 서로 다른 가격 2개 이하**.
  대부분의 상품에서 시계열은 평평한 직선이라 정보가 없음. 매장에서의 실제 질문은
  "지금 사도 되나"인데 시계열은 그 분석을 사용자에게 떠넘김.
  그래프는 유지하되(추세는 여전히 좋은 시각 지표) 결론을 먼저 준다.

## 저가 기준선: 매장별이 아니라 전체 최저가 1개
- 두 매장 통틀어 기록된 최저가에 점선 1개
- **Why:** 매장별로 그리면 기준점이 둘이라 서로 다른 잣대로 읽힘 — 비싼 매장이 자기
  바닥에 있으면 좋은 가격처럼 보이는 착시. 하나면 두 선이 같은 잣대로 측정되고,
  선 4개 → 1개로 줄어 좁은 모바일 캔버스에서도 읽힘.

## 레인지 셀렉터: 데이터 길이에 따라 자동 노출
- `r.days < spanDays`인 구간만 렌더링 (현재 3.2개월 → 1M/3M/All만 표시)
- **Why:** 6M 버튼이 All과 같은 결과를 주면 사용자는 "눌렀는데 왜 그대로지?"가 됨.
  데이터가 쌓이면 코드 수정 없이 6M·1Y가 나타나므로 유지보수도 필요 없음.

## 차트 색: 브랜드 색보다 색맹 판별을 우선
- 라이트 오버레이 `#166534`(Woolworths) / `#f8776a`(Coles)
- 검증: `validate_palette.js` — CVD ΔE 17.0(protan), 일반시야 36.0
- **Why:** 브랜드 그대로인 초록 `#16a34a` ↔ 빨강 `#dc2626`은 적록색약에서 **ΔE 5.0**으로
  사실상 같은 선. 초록↔빨강/주황은 명도가 비슷하면 어떤 조합도 무너져서, 명도를 벌리는
  방식으로 해결(색상은 무너져도 명도는 색약에서 살아남음). 색에만 의존하지 않도록
  범례·매장별 수치 텍스트·끝점 도형 차이(네모/동그라미)를 함께 둠.
  TODO Priority 7의 WCAG AA와 직결.

## CHEAPEST 뱃지: 차콜 (브랜드 색 회피)
- `bg-gray-900` + 흰 글씨
- **Why:** 초록은 Woolworths, 빨강은 Coles의 브랜드 색이라 어느 쪽을 써도 "판정"이 아니라
  "매장"으로 읽힘. 맛차 그린도 초록 계열이라 같은 문제. 차콜은 이미 앱의 기본 버튼
  색이라 이질감이 없고 어느 매장으로도 오해되지 않음.

## Favorites: 로그인 필수 (localStorage 제거)
- 기존: 비로그인 → localStorage, 로그인 시 DB 병합
- 변경: 비로그인 하트 클릭 → /login 리다이렉트, DB 전용
- **Why:** 데이터 일관성 + 기기 간 동기화 보장. 핵심 플로우(집에서 담기 → 매장에서 보기)가 로그인 전제. localStorage 병합 로직의 엣지 케이스 제거.
