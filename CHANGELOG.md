# Changelog — AussieDeals

Format: significant user-facing or architecture changes only.

## [In progress]
- ProductGroup 단위 찜 (어디서 하트를 눌러도 양쪽 매장 반영)
- 세일 감지 파이프라인 (찜 목록 배지 + 푸시 알림)
- "Real deal" badge
- 다크모드 (앱 전체)

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
