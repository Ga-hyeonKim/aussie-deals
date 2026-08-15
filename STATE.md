# 현재 상태

> 이 파일은 **덮어쓴다**. 시간순 기록은 `SESSION_NOTES.md`, 이력은 git.
> 세션 시작에 읽히는 유일한 상태 문서 — 여기 없는 건 없는 것으로 친다.
>
> 마지막 갱신: 2026-08-15

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
├─ fetch-coles-catalog        월 21:00 UTC  →  StoreProduct
└─ match-products             화 23:00 UTC  →  embedding + ProductGroup
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
- **매칭 파이프라인** (2026-08-15 연결) — 스크레이퍼 4개가 다 끝난 뒤 embed → match.
  두 단계 모두 증분(`embedding IS NULL`, `product_group_id IS NULL`)이라 기존
  그룹과 그 URL은 건드리지 않는다.
  - 임베딩: `text-embedding-3-small`, 256차원, `normalizedName`만 임베딩.
    **양쪽 매장 공통 브랜드만** — 매칭이 `canonical_brand`로 조인하므로 한쪽에만
    있는 브랜드는 임베딩해도 짝을 만들 수 없다 (전체의 36.6%)
  - 매칭: `canonical_brand` 조인 + 코사인 유사도 > 0.92 + `sameSize()` 게이트
  - `store_products.embedding`에 **벡터 인덱스 없음** (exact scan). 브랜드로
    먼저 좁혀서 1~3초에 끝나므로 아직 문제 아님
  - 현재 `ProductGroup` 2,861개, 임베딩 36,239개

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

## 최근 (2026-08-15, PR #2 머지됨)

**매칭 파이프라인 연결** — 4개월 만에 미완성 기능 하나가 실제로 돈다.

- `ProductGroup` 3,362개 해체 → **2,861개 재생성.** 용량 게이트를 전체에 균일
  적용한 결과 후보 4,621개 중 **1,193개(25.8%)가 크기 불일치로 거부**
  (Cetaphil 236mL ↔ 1L, Bega 250g ↔ 500g). 즐겨찾기 0건이라 영향 없음
- `.github/workflows/match-products.yml` 신설 — 화 23:00 UTC.
  가장 늦은 스크레이퍼(Coles 특가, 화 21:30 + 30분 상한)보다 뒤
- `match-products.ts`가 실패를 `console.error`로 삼키고 **exit 0**이었음 → 수정.
  크론에 붙이는 순간 Priority 0.7이 막았던 "초록불인데 빈 결과"가 그대로 부활할 자리
- `OPENAI_API_KEY`를 GitHub secret에 등록

**검증에서 나온 것** — 첫 실행은 초록불이었지만 아무것도 증명하지 못했다.
임베딩 대상이 0개라 OpenAI를 부르기 전에 조기 종료했고, **키가 완전히 망가진
상태에서도 성공으로 보였다.** 상품 하나의 임베딩을 일부러 비워 파이프라인에
일을 준 뒤에야 401이 드러났음 (원인: `.env`의 따옴표가 시크릿에 같이 들어감).
2026-08-12 사건과 같은 모양 — **"할 일이 없어서 성공"과 "제대로 해서 성공"을
로그가 구분해주지 않는다.**

## 이전 (2026-08-13, PR #1)

**가드레일** — 커밋 5개.

- 크론 4개에서 `prisma db push --accept-data-loss` 제거
  (2026-04-17부터 4개월간 매주 프로덕션에 실행되고 있었음)
- `ci.yml` — push/PR마다 lint + typecheck + test + build
- `scripts/` 1,327줄을 타입체크에 편입 (에러 0개였음)
- vitest 도입, `lib/` 불변식 50케이스, `scripts/test-scrape-report.ts` 이식
- `fetch-coles.ts`의 인라인 할인 판정 → `isRealDeal()`
  (dump 6,947행 대조, 불일치 0건)

ESLint에 React Compiler 룰 8건이 warn으로 베이스라인됨 — 6개 파일 한정.
데이터 페칭 패턴을 손볼 때 같이 사라진다.

**문서 구조화** — 커밋 3개.

- `CLAUDE.md` 118 → 88줄. 항상 참인 것만 남기고 나머지는 내보냄
- `AGENTS.md` 삭제 (7/28 이후 방치, 파일 맵이 이미 틀려 있었음).
  고유 제약 4개는 Invariants로 흡수
- `.claude/skills/` 4개 신설 — `scraper-work`, `db-schema`, `debug-log`,
  `session-wrap`. `.claude/commands/wrap-up.md`는 마지막 것으로 대체
- `STATE.md` 신설 (이 파일)
- 메모리 17개 → 1개. 프로젝트 사실은 이 파일로, 프로젝트를 넘나드는 건
  글로벌 `CLAUDE.md`로 옮김

`.claude/`는 의도적으로 gitignore 유지 — 스킬은 로컬에만 있고 저장소에 안 들어간다.

## 측정된 부채 (다음 구조 정리의 재료)

| 항목 | 규모 |
|---|---|
| 스크레이퍼 중복 | 1,327줄 중 330~400줄이 near-verbatim |
| API 응답 타입 | 손으로 4번 재선언. `Date` vs `string` 불일치 버그 상존 |
| 데이터 페칭 | 3가지 방식 공존. 서버가 이미 가진 데이터를 클라이언트가 재요청 |
| 죽은 코드 | `app/api/products/route.ts`(호출자 0), backfill 스크립트 2개, `reclaim-space.ts` |
| 중복 구현 | `scripts/backfill-canonical-brand.ts`가 `lib/canonicalize.ts` 손복사본 |
| 포맷 헬퍼 | money `toFixed(2)` 31곳, 스토어 라벨 5곳, 날짜 포맷 5곳 |
| 문서 중복 | 2026-08-12 사고 하나가 여전히 `DEBUGGING`/`DECISIONS`/`CHANGELOG`/`SESSION_NOTES`/코드 주석에 중복 기록 |
| N+1 | `app/product-group/[id]/page.tsx` — 그룹 멤버당 쿼리 2회 |
| 근거 없는 상수 | `match-products.ts`의 `SIMILARITY_THRESHOLD = 0.92` — 검증 안 됨. 08-15 재생성에서 threshold 바로 위(92.0%)에 맛·성분만 다른 쌍이 관측됨 (`Dry Dog Food with Beef` ↔ `with Chicken`) |
| 영구 후보 | 크기 불일치로 거부된 643쌍이 `product_group_id IS NULL`로 남아 **매주 다시 평가되고 다시 거부됨.** 1초라 비용은 아니지만 로그에 "100.0% 거부"가 매주 찍힌다 |

## 다음 (순서)

1. **마이그레이션 도입** — baseline 생성 후 `migrate deploy`. 수동 DDL(pg_trgm,
   미존재 벡터 인덱스)이 버전 관리로 편입됨
2. **threshold 0.92 검증** — 이제 파이프라인이 자동으로 도니까, 다음은 그것이
   내는 답이 맞는지. 라벨링 세트 → precision/recall 곡선. `TODO.md` 면접 트랙
3. **코드 구조 정리** — 위 부채 표. 스크레이퍼 중복은 **스토어 추가할 때** 같이
4. **README에 사례 꺼내기** — 인시던트가 `DEBUGGING.md` 574줄에 묻혀 있음.
   면접 질문을 부르는 자산인데 아무도 안 봄

`TODO.md`에 별도 트랙 두 개가 더 있다 — 면접 준비(드릴 파생)와 Priority 0.9 보안.
