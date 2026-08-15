# Changelog — AussieDeals

Format: significant user-facing or architecture changes only.

## [In progress]
- ProductGroup 단위 찜 (어디서 하트를 눌러도 양쪽 매장 반영)
- 세일 감지 파이프라인 (찜 목록 배지 + 푸시 알림)
- "Real deal" badge
- 다크모드 (앱 전체)

## 2026-08-15
- **크로스스토어 묶음이 매주 자동으로 갱신됨** — 새로 들어온 상품도 다음 주부터
  양쪽 매장 비교에 잡힌다. 예전엔 수동으로 한 번 돌린 것이 전부라, 그 뒤 추가된
  상품은 영영 묶이지 않았음
- **크기가 다른 상품이 같은 상품으로 묶이던 문제 정리** — 250g 치즈와 500g 치즈,
  236mL 로션과 1L 로션이 한 상품으로 비교되고 있었음. 전체를 다시 묶으면서
  **잘못된 묶음 1,193건 제거** (묶음 3,362 → 2,861개)
- 참고: 묶음을 다시 만들었으므로 기존 `/product-group/...` 링크는 더 이상 유효하지 않음

## 2026-08-12
- **에러 화면 신설** — 서버나 DB가 잠깐 죽었을 때 나오던 `Application error: a
  server-side exception has occurred` 흰 화면 대신, 무슨 일인지 알리고 **재시도 버튼**
  제공. 재시도는 Neon 콜드 스타트를 실제로 복구함
- **없는 상품 페이지에 전용 화면** — 예전엔 Next 기본 404
- 로딩 중 빈 화면 대신 스피너 (메인)
- **찜 목록이 "비어 있음"으로 잘못 보이던 문제 수정** — 서버가 잠깐 아플 때 찜한 게
  전부 날아간 것처럼 보였음. 이제 "연결 문제이고 데이터는 그대로 있다"고 표시 + 재시도
- 가격 그래프도 "기록 없음"과 "못 불러옴"을 구분 (기록이 몇 달치 있어도 "없음"이라 했음)
- **하트/찜 삭제가 실패하면 되돌림** — 저장이 안 됐는데 저장된 것처럼 보이던 문제
- 없는 상품 URL이 HTTP 200을 반환하던 문제 수정 (404로)
- 스크래퍼: 저장에 실패하면 워크플로가 **빨간불로 멈춤**. 08-11 주 가격 이력이 통째로
  유실됐는데 초록불이었음. 완료 로그도 시도 수가 아니라 실제 저장 건수를 출력
- DB: 저장 공간 490MB → 305MB 회수, 크로스스토어 매칭용 임베딩 36,239개 생성

## 2026-08-11
- **배포 복구** — 08-10 15:43 이후 모든 Vercel 빌드가 실패하고 있었음. 라이브가 22시간 정체
- **세일 아닌 상품에 ON SALE 뱃지가 붙던 문제 수정** — 콜스가 `/on-special`에 할인 없이
  올린 항목(Low Price, New, 멀티바이)을 특가로 표시하고 있었음. 라이브 콜스 특가의 30%
- 콜스 스크래퍼: 실제 할인폭이 있을 때만 특가로 기록 (다음 수요일 크론부터 적용)
- 상품 상세의 가격 그래프 판정이 카드 가격과 어긋나던 문제 수정 — 2주 전 세일가를
  "지금 가격"으로 표시하던 케이스
- 가격 이력이 1주치뿐인 상품은 그래프 대신 판정만 표시 (곡선을 주장하지 않음)
- DB 스키마: `embedding` 컬럼을 `schema.prisma`에 등재 (스크래퍼 워크플로가 지우던 문제)
- 크로스스토어 매칭에 용량 비교 추가 — 226g와 473mL이 같은 상품으로 묶이던 문제
  (기존 그룹의 18%). 코드만 반영, 재생성은 미실행

## 2026-08-10
- 크로스스토어 통합 상세 페이지 `/product-group/[id]` — 양쪽 매장 가격, CHEAPEST 뱃지, 절약액
- 크로스스토어 가격 그래프 — "지금 어디가 싼지" 판정 + 겹친 비교 + 역대 최저가 기준선
- 찜 목록 검색: 크로스스토어 상품을 한 카드로 묶고 양쪽 가격 표시
- 찜 목록 검색: 세일 중인 상품이 정가로 표시되던 버그 수정 (세일가 + 할인율 표시)
- Deals/찜 목록: 뒤로 가기 시 매장 탭·페이지·필터·검색어 복원 (URL 파라미터)
- 검색 중 이전 검색어 결과가 잠깐 끼어드는 문제 수정

## 2026-08-09
- AI embedding 크로스스토어 매칭 가동: 256차원 임베딩 98,595개 + ProductGroup 2,438개 생성
- 찜 목록: 비로그인 하트 → 토스트 안내 ("Sign in to save favourites")
- 찜 목록: 검색 결과에 WATCHING 뱃지 + smooth scroll to watchlist
- Cart/Favorites: Clear All에 confirm 다이얼로그 추가
- 검색 결과 limit 확대 (60→200)

## 2026-08-05
- `normalizedName` 정규화 필드 추가 (브랜드 제거 + 단위 통일, 스크래퍼 4개 연결)
- `ProductGroup` 모델 추가 — 크로스스토어 매칭 결과 저장 테이블
- 찜 목록: 반대쪽 매장 가격/세일 정보 카드에 표시
- 장바구니/찜 목록: Edit 모드 추가 (선택 삭제 + 전체 삭제)
- Favorites 로그인 필수로 변경 (비로그인 하트 → 로그인 페이지 리다이렉트)

## 2026-07-28
- GitHub Actions: prisma db push retry 로직 추가 (Neon cold start 대응, 4개 workflow 전부)
- 프로젝트 재정의: 크로스스토어 매칭 전략을 pg_trgm → AI embeddings로 변경
- 문서 전면 정비 (CLAUDE.md, AGENTS.md, README.md, CHANGELOG.md, TODO.md, DECISIONS.md)

## 2026-05-08
- `canonicalBrand` 컬럼 StoreProduct에 추가, 81,709행 백필 완료
- 스크래퍼 4개에 `canonicalBrand` 자동 저장 연결
- GitHub Actions 타임아웃 조정 (울리스 전체 300분, 콜스 전체 150분)

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
