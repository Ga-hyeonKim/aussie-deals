# 현재 상태

> 이 파일은 **덮어쓴다**. 시간순 기록은 `SESSION_NOTES.md`, 이력은 git.
> 세션 시작에 읽히는 유일한 상태 문서 — 여기 없는 건 없는 것으로 친다.
>
> 마지막 갱신: 2026-08-13

## 무엇을 위한 프로젝트인가

경력이 없는 상태에서 **자신을 대표할 작품**. 본인이 쓰려고 시작했고 지금도 쓰지만,
충돌하면 포트폴리오가 이긴다.

완료 기준은 "기능이 몇 개"가 아니라 **면접관이 질문하고 싶어지는가**. 깔끔한 CRUD 앱은
질문을 부르지 않는다. 숫자·실패·판단이 부른다.

12월까지: 남에게 링크를 보낼 수 있는 상태 + 그 링크가 위 질문들을 부르는 상태.

**사용자** — 지금은 본인과 지인 몇 명. 언젠가 공개가 목표지만, 공개 규모의 문제
(접근성 감사, 악의적 입력, 스크레이핑 정당성)에 지금 비용을 쓰지 않는다. 다만 나중에
열 수 있는 방향으로 짓는다.

**비용** — 투자 가치가 있으면 쓴다. 현재 판단: 임베딩은 몇 센트라 아낄 이유 없음.
Neon 유료 전환은 안 함 — 공간을 먹는 건 중복 많은 `PriceHistory`고, 그건 돈 문제가
아니라 데이터 모델 문제. 도메인(연 ~$20)은 쓸 값어치 있음.

## 지금 돌아가는 것

```
GitHub Actions (cron, 주간)          Vercel
├─ fetch-woolworths-specials  화 21:00 UTC  →  Product
├─ fetch-coles-specials       화 21:30 UTC  →  Product + StoreProduct
├─ fetch-woolworths-catalog   월 20:00 UTC  →  StoreProduct
└─ fetch-coles-catalog        월 21:00 UTC  →  StoreProduct
                                   ↓
                            Neon PostgreSQL  →  Next.js 16 (App Router)
```

- **2-테이블 설계** — `Product`(주간 특가, 기간 있음) / `StoreProduct`(상시 카탈로그).
  합치지 않는다. `Favorite`→`StoreProduct`, `CartItem`→`Product`.
- **스크레이퍼** — 두 마트 모두 AWS발 직접 HTTP를 차단해서 GHA에서 Playwright stealth.
  Coles는 `__NEXT_DATA__` 파싱 + Imperva 3회 재시도.
- **인증** — Google OAuth, NextAuth v5, JWT 30일.
- **UI** — 홈(주간 특가), 검색, 상품/스토어상품/크로스스토어 상세, 즐겨찾기, 장바구니.
  가격 이력 차트(Recharts). PWA 셸 + 서비스워커(캐시만, 푸시 없음).

## 만들었지만 연결 안 된 것

- **임베딩/매칭 파이프라인** — `scripts/embed-products.ts`, `match-products.ts`가
  **어떤 워크플로에도 없다.** 한 번 수동 실행해 `ProductGroup`을 채웠고, 그 뒤
  스크레이퍼가 매주 새 행을 넣지만 아무도 임베딩하지 않는다. 조용히 썩는 중.
  - 임베딩: `text-embedding-3-small`, 256차원, `normalizedName`만 임베딩
  - 매칭: `canonical_brand` 조인 + 코사인 유사도 > 0.92 + `sameSize()` 게이트
  - `store_products.embedding`에 **벡터 인덱스 없음** (exact scan)

## 아직 없는 것

- 푸시 알림 (서비스워커에 `push` 핸들러 없음)
- "진짜 할인" 배지 (salePrice vs PriceHistory 평균)
- 개인화 추천
- 즐겨찾기 크로스스토어 (하트 하나로 양쪽)

## 제약

| 제약 | 현황 |
|---|---|
| Neon 무료 512MB | 2026-08-11에 한도 도달 → 185MB 회수. `PriceHistory` 중복이 주범 |
| Vercel 이미지 변환 5,000건 | 상품 이미지 전부 `unoptimized`로 우회 |
| 마트의 스크레이핑 차단 | stealth 우회 중. 공개 서비스가 되면 실제 문제 |
| Prisma 마이그레이션 없음 | `db push`만 씀. pg_trgm 인덱스가 마크다운에만 존재 |

## 최근 (2026-08-13, `chore/guardrails`, 미푸시)

1단계 가드레일 완료 — 커밋 5개.

- 크론 4개에서 `prisma db push --accept-data-loss` 제거
  (2026-04-17부터 4개월간 매주 프로덕션에 실행되고 있었음)
- `ci.yml` — push/PR마다 lint + typecheck + test + build
- `scripts/` 1,327줄을 타입체크에 편입 (에러 0개였음)
- vitest 도입, `lib/` 불변식 50케이스, `scripts/test-scrape-report.ts` 이식
- `fetch-coles.ts`의 인라인 할인 판정 → `isRealDeal()`
  (dump 6,947행 대조, 불일치 0건)

ESLint에 React Compiler 룰 8건이 warn으로 베이스라인됨 — 6개 파일 한정.
데이터 페칭 패턴을 손볼 때 같이 사라진다.

## 측정된 부채 (다음 구조 정리의 재료)

| 항목 | 규모 |
|---|---|
| 스크레이퍼 중복 | 1,327줄 중 330~400줄이 near-verbatim |
| API 응답 타입 | 손으로 4번 재선언. `Date` vs `string` 불일치 버그 상존 |
| 데이터 페칭 | 3가지 방식 공존. 서버가 이미 가진 데이터를 클라이언트가 재요청 |
| 죽은 코드 | `app/api/products/route.ts`(호출자 0), backfill 스크립트 2개, `reclaim-space.ts` |
| 중복 구현 | `scripts/backfill-canonical-brand.ts`가 `lib/canonicalize.ts` 손복사본 |
| 포맷 헬퍼 | money `toFixed(2)` 31곳, 스토어 라벨 5곳, 날짜 포맷 5곳 |
| 문서 | 8개 1,682줄. 2026-08-12 사고 하나가 8곳에 기록됨 |
| N+1 | `app/product-group/[id]/page.tsx` — 그룹 멤버당 쿼리 2회 |

## 다음 (순서)

1. **문서 구조화** — `CLAUDE.md` 40줄로 축소, `AGENTS.md` 삭제, skills 4개 신설
2. **마이그레이션 도입** — baseline 생성 후 `migrate deploy`. 수동 DDL(pg_trgm,
   미존재 벡터 인덱스)이 버전 관리로 편입됨
3. **임베딩/매칭 워크플로 연결** — 부채가 아니라 미완성 기능
4. **코드 구조 정리** — 위 부채 표. 스크레이퍼 중복은 **스토어 추가할 때** 같이
5. **README에 사례 꺼내기** — 인시던트가 `DEBUGGING.md` 574줄에 묻혀 있음.
   면접 질문을 부르는 자산인데 아무도 안 봄
