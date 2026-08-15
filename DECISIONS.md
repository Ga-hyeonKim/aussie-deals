# Architecture Decisions — AussieDeals

## 매칭은 스크레이퍼에 체이닝하지 않고 고정 시각 크론으로 돈다
- `match-products.yml`을 화 23:00 UTC 고정 크론으로. `workflow_run`으로 스크레이퍼
  뒤에 매다는 방식은 쓰지 않음
- **Why:** 매칭은 스크레이퍼 **4개 전부**의 결과를 필요로 하는데 `workflow_run`은
  하나의 워크플로에만 매달린다. 마지막 하나를 골라 매달면 그 워크플로가 실패한
  주에는 매칭이 아예 안 돌고, 4개 모두에 매달면 한 주에 4번 돈다. 고정 시각은
  가장 늦은 스크레이퍼(Coles 특가, 화 21:30 + 30분 상한)보다 1시간 뒤라
  여유가 있고, 어긋나도 다음 주에 증분으로 따라잡는다 — 매칭은 멱등이라
  한 주 늦는 것이 손실이 아니다

## 스크레이핑 잡은 스키마를 마이그레이션하지 않는다
- 크론 4개에서 `prisma db push --accept-data-loss` 스텝을 제거. 대체 스텝을 넣지 않음
- 드리프트가 나면 첫 upsert가 던지고 `scrape-report`가 non-zero로 죽는다 —
  원래 이 스텝이 원했던 신호는 이미 그렇게 얻어진다
- **Why:** 배포와 작업의 책임 분리. 주간 스크레이프가 스키마를 바꿀 이유가 없는데,
  바꿀 *권한*을 갖고 있었던 탓에 2026-08-12에 임베딩 98,595개가 날아갔다.
  읽기 전용 드리프트 체크(`migrate diff --exit-code`)도 검토했으나, 수동 DDL(pg_trgm)이
  스키마 밖에 있어 항상 드리프트로 잡힌다 — 마이그레이션 도입 이후로 미룸

## 린트를 새로 켤 때 기존 위반은 베이스라인, 파일 단위로 좁혀서
- Next 16이 켠 React Compiler 룰 7건을 해당 6개 파일에 한해서만 `warn`으로 낮춤.
  `scripts/`의 `no-explicit-any` 8건은 실제로 수정
- **Why:** 첫날부터 초록이 아닌 CI는 무시하는 법을 배우게 된다. 그렇다고 전부 고치면
  "데이터 페칭 패턴 재작업"이라는 별건 작업이 CI 도입의 전제조건이 되어버린다.
  파일 목록으로 좁혀두면 **새 파일이 같은 문제를 내면 여전히 빌드가 깨진다** —
  래칫이지 면제가 아니다. 목록이 비면 블록째 지운다

## `CLAUDE.md`는 항상 참인 것만, 나머지는 skill로
- `CLAUDE.md` 118 → 88줄. 기술 스택·커맨드 목록(`package.json`에 이미 있음),
  아키텍처 트리·DB 모델(변하는 것), 수동 DDL(마이그레이션으로 갈 것)을 내보냄
- 상황별 지식은 `.claude/skills/` 4개로. `AGENTS.md`는 삭제
- **Why:** `CLAUDE.md`는 매 세션 전량 로드된다. 여기 든 것은 관련 없을 때도 비용을
  낸다. 판단 기준은 "이걸 모르면 코드를 망가뜨리는가" — 아니면 온디맨드로 내려간다.
  skill은 한 줄 description만 상시 보이고 본문은 필요할 때 열린다

## 상태는 누적하지 않고 덮어쓴다 (`STATE.md`)
- `SESSION_NOTES.md`(시간순)와 `TODO.md`(백로그) 둘 다 누적이라 "지금 어디까지 왔나"를
  한 번에 답하지 못했음. `STATE.md`는 덮어쓰기 전용
- **Why:** 문서가 8개인데 어느 것도 현재 상태를 답하지 않아서, 2026-08-13 세션의
  제일 비싼 구간이 이미 서 있었어야 할 지도를 다시 그리는 데 쓰였다.
  누적 문서는 자라기만 하고, 자란 문서는 안 읽힌다

## 지식은 세 층 중 정확히 한 곳에 (메모리는 마지막 수단)
- 프로젝트 사실 → 저장소 파일 / 프로젝트를 넘나드는 것 → 글로벌 `CLAUDE.md` /
  둘 다 아닌 것만 → 메모리. 메모리 17개를 1개로 줄임
- **Why:** 메모리는 사용자가 읽을 수 없는 유일한 층이라, 틀려도 눈에 띄지 않는다.
  `feedback_learning_style`이 108일간 낡은 채였고 나쁜 출력을 낼 때까지 아무도 몰랐다.
  같은 이유로 2026-04-14의 비밀번호 노출 경고가 4개월간 묻혀 있었다

## pgvector 컬럼은 `Unsupported()`로 스키마에 선언 (수동 DDL만으로는 부족)
- `embedding vector(256)`을 Neon SQL Editor에서만 만들고 `schema.prisma`에는 두지 않았더니,
  워크플로의 `prisma db push --accept-data-loss`가 드리프트로 판단해 컬럼을 DROP (임베딩 98,595개 소실)
- `Unsupported("vector(256)")?`로 선언하면 Prisma가 컬럼을 생성·보존하고, Prisma Client는
  읽지 못하므로 embed/match 스크립트는 계속 raw SQL을 씀
- **Why:** `db push`는 `schema.prisma`를 유일한 진실로 취급한다. 스키마 파일 밖에서 만든 것은
  정의상 "지워야 할 드리프트"다. Prisma가 타입을 모른다는 사실이 스키마 우선 원칙의 예외를
  만들어주지 않는다 — 탈출구(`Unsupported`)가 있다.

## 세일 판정을 단일 함수로 (`lib/deal.ts`의 `isRealDeal`)
- 6곳이 각자 "`currentDeal`이 존재하면 세일"로 판단하고 있었음. 콜스 특가의 30%가 할인 0원이라
  전부 틀린 판단이었음
- 센트 정수로 비교 (`Math.round(n*100)`) — 부동소수점에서 `5.00 - 4.99 = 0.00999...`가 되어
  `>= 0.01` 비교는 진짜 1센트 할인을 탈락시킴
- 타입 서술어(`deal is T & { originalPrice: number }`)로 선언해서 호출부에서 `!` 없이 좁혀짐
- **Why:** 이름 없는 가정은 복사된다. 6곳으로 퍼진 판단을 한 곳에 모으면 고칠 곳도 한 곳이 된다.
  센트 단위 비교는 UI가 소수점 2자리로 반올림해 보여주는 값과 판단 기준을 일치시킨다.

## 차트는 현재가를 유추하지 않고 페이지에서 받는다
- `CrossStorePriceChart`가 PriceHistory의 마지막 행을 "지금 가격"으로 쓰고 있었음.
  두 매장의 시계열이 끝나는 날짜가 다른 경우가 97.3%라 stale vs fresh 비교가 됨
- 페이지가 카드 렌더에 이미 계산하는 `effectivePrice`를 prop으로 주입하고, 차트는 오늘 점을
  그 값으로 고정
- **Why:** 같은 숫자를 두 곳에서 각자 유도하면 언젠가 갈라진다. 한쪽이 계산하고 다른 쪽이
  받아쓰게 하면 불일치가 구조적으로 불가능해진다. PriceHistory는 구멍 난 아카이브이므로
  "과거의 모양"으로만 쓴다.

## 크로스스토어 매칭에 용량 하드 게이트 (`lib/unit.ts`)
- 브랜드는 하드 게이트였는데 용량은 게이트가 없었고, `normalizedName`이 용량을 지우므로
  임베딩이 226g와 473mL을 구별할 방법이 없었음 → 그룹의 18.2%가 다른 상품을 비교
- 팩 구조를 유지: `375mL x 10 pack ≠ 3.75L`, `2x100g ≠ 200g`
- 용량 주장이 없으면(`1EA`, `each`, 빈 값) 거부가 아니라 **판단 보류**
- **Why:** 총량으로 환산하면 10캔 묶음과 큰 병이 같아진다. 그리고 한쪽 매장이 용량을 적지
  않은 것은 불일치의 증거가 아니므로, 거부하면 얻는 것 없이 진짜 매칭만 잃는다.

## 임베딩은 양쪽 매장 공통 브랜드에만 생성
- 매칭 쿼리가 `w.canonical_brand = c.canonical_brand`로 조인하므로, 브랜드가 한쪽 매장에만
  있는 상품의 임베딩은 어떤 경우에도 매칭을 만들 수 없음
- 98,805개 중 36,229개(36.7%)만 해당 → 97MB 대신 36MB
- **Why:** 매칭 불가능한 상품의 임베딩은 저장 공간을 쓰는 것 외에 아무 일도 하지 않는다.
  Neon 무료 한도 512MB에서 61MB는 큰 비중이다.

## 저장 공간 회수는 "무엇을"보다 "어떤 순서로"
- Neon 512MB에 490MB. `VACUUM FULL`이 66MB 시체를 회수하려면 88MB 여유가 필요한데
  22MB뿐이라 한 번 "불가능"으로 닫았음
- 실제로는 안 쓰는 인덱스 2개(52MB + 84MB)를 먼저 떨어뜨린 직후 **158MB가 비는 창**이
  있었고, 그 안에서만 `VACUUM FULL`이 가능. 순서를 뒤집어 PK를 먼저 만들면 여유가
  82MB로 줄어 실패함
- **Why:** 각 단계의 가능/불가능만 보면 못 찾는다. 같은 작업 집합인데 순서만으로 성패가
  갈리므로, 자원이 빠듯할 때는 단계 사이의 중간 상태를 봐야 한다. 그래서 스크립트가
  단계마다 실제 크기를 찍는다 — 예상치는 두 번 다 빗나갔다(66→109MB, 76→62MB).

## `price_history`는 surrogate `id` 없이 `(storeProductId, recordedAt)` 복합 PK
- cuid `id`와 그 PK 인덱스 52MB가 `idx_scan = 0`. 모든 조회는 복합 인덱스로 나감
- 쌍을 PK로 승격하고 `id` 컬럼 제거. `DROP COLUMN`은 공간을 즉시 회수하지 않지만
  이후 행마다 ~29바이트를 아낌
- 부작용: 유니크 단위가 **날짜가 아니라 timestamp**라, 하루에 두 번 도는 워크플로는
  여전히 같은 날 두 행을 만듦. 그리고 `createMany` 한 배치는 `CURRENT_TIMESTAMP`를
  공유하므로 배치 내 중복 상품 하나가 배치 전체를 죽일 수 있어 `skipDuplicates` 필요
- **Why:** 읽히지 않는 인덱스는 비용만 있는 자산이다. 자연키가 이미 모든 조회를
  감당하고 있다면 surrogate는 습관이지 설계가 아니다.

## 실패 판정은 두 가지 기준으로, `.catch`는 없애지 않는다
- 스크래퍼가 실패를 잡아 로그만 찍고 exit 0으로 끝나서, 7,134건 전건 실패가 `success`로
  보고됨. 완료 로그는 `products.length`(**시도한 수**)를 출력
- `lib/scrape-report.ts`가 종류별로 시도/성공/실패를 세고, **성공 0건** 또는
  **실패율 5% 초과**면 종료 코드를 1로. 같은 원인은 메시지로 묶어 상위 3개만 출력
- **Why:** `.catch`를 없애면 상품 하나 때문에 7천 개를 버린다. 개별 catch는 옳은
  선택이었고, 문제는 잡은 뒤 **개수를 세지 않은 것**이다. 로그는 카운터가 아니다 —
  사람이 읽어야만 정보가 되는 것은 자동화된 파이프라인에서 정보가 아니다.

## 메인 페이지만 `(browse)` 라우트 그룹으로 (loading UI와 404를 둘 다 얻기 위해)
- `app/loading.tsx`를 추가하자 `notFound()`가 404 대신 **200**을 반환하기 시작.
  `loading.tsx`가 있으면 Next가 즉시 스트리밍을 시작해서, 200 헤더가 나간 뒤에
  "없는 상품"임을 알게 되어 상태 코드를 못 바꿈 (상세 3개 라우트 전부 200이었음)
- `app/page.tsx`를 `app/(browse)/page.tsx`로 옮기고 `loading.tsx`를 그 안에 둠.
  괄호 폴더는 URL에 안 나타나므로 주소는 `/` 그대로, 상세 라우트는 스트리밍 안 함
- **Why:** 둘 중 하나를 포기하는 선택지(로딩 화면 없이 흰 화면 / 없는 상품이 200)가
  각각 사용자 경험과 기계 판독성을 버린다. 라우트 그룹은 파일 위치만 바꿔서 둘 다
  지킨다. 그리고 **순수한 추가도 변경이다** — `loading.tsx`는 아무것도 안 고쳤는데
  상태 코드를 바꿨고, 실제로 재보지 않았으면 배포까지 갔다.

## 실패를 빈 값으로 바꾸지 않는다 (UI 상태를 4개로)
- `.then(r => r.ok ? r.json() : [])`가 4곳. 상태가 `loading`/`empty` 둘뿐이라 실패가
  갈 곳이 없어 `empty`로 흡수됨 → 찜 목록이 **텅 빈 것처럼** 보임(= 찜한 게 날아간 것처럼)
- 실패를 throw로 올려 `loading`/`error`/`empty`/`data` 넷으로 분리. 낙관적 업데이트
  3곳(하트 토글, 찜 삭제 2곳)은 실패 시 롤백
- 서버도 같이: `DELETE /api/favorites`가 모든 에러를 삼키고 `{ok:true}`를 반환하고
  있었음 → `P2025`(이미 없음)만 정상으로 치고 나머지는 500
- **Why:** 6곳 모두 에러를 *잡고* 있었다. 잡은 다음 빈 값으로 바꿔 정상 경로로 흘린 게
  문제라, `.catch`가 있는지 세는 리뷰로는 안 걸린다. 그리고 계층은 **바깥부터** 고쳐야
  한다 — 클라이언트 롤백을 다 붙인 뒤에야 서버가 `{ok:true}`를 준다는 걸 발견했고,
  순서가 반대였으면 클라이언트 작업이 처음부터 동작했다.

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
