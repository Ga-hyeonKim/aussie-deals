# Changelog — AussieDeals

Format: significant user-facing or architecture changes only.

## [In progress]
- AI embedding 기반 크로스스토어 매칭 — 코드 완료, DB 실행 대기 (pgvector + ProductGroup)
- 세일 감지 파이프라인 (찜 목록 배지 + 푸시 알림)
- "Real deal" badge

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
