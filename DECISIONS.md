# Architecture Decisions

Why AussieDeals is built the way it is. Each entry records the decision, the
constraint that forced it, and what it cost. Entries are grouped by area, not
by date.

Three decisions in here were **reversed** after they shipped. They are marked
`[REVERSED]` and kept in place rather than deleted, because the reason for the
reversal is usually more useful than the original choice:

| Decision | From | To |
|---|---|---|
| [Favourites storage](#favourites-require-an-account-reversed) | localStorage with merge on login | account required |
| [Page state](#page-state-lives-in-the-url-reversed) | sessionStorage | URL parameters |
| [Cross-store matching](#matching-uses-embeddings-not-string-similarity-reversed) | pg_trgm string similarity | embedding cosine similarity |

---

## Data model

### Two tables: `Product` and `StoreProduct`

- `Product`: weekly specials. Has `validFrom`, `validTo`, `salePrice`,
  `discountPercent`.
- `StoreProduct`: the permanent catalogue. Current price, no date scope.

**Why:** specials are time-scoped and catalogue prices are always current. One
table would need expiry logic on every read and would leave stale sale data
sitting in the catalogue view.

### `price_history` uses a composite primary key, with no surrogate `id`

- The cuid `id` and its 52MB primary key index had `idx_scan = 0`. Every query
  went through the composite index instead.
- Promoted `(storeProductId, recordedAt)` to the primary key and dropped the
  `id` column. `DROP COLUMN` does not reclaim space immediately, but it saves
  roughly 29 bytes per row from then on.

**Why:** an index nothing reads is a liability, not an asset. If the natural key
already carries every query, a surrogate key is habit rather than design.

**What it cost:** the unique unit is now a *timestamp*, not a date, so a
workflow that runs twice in one day still writes two rows for that day. A single
`createMany` batch also shares one `CURRENT_TIMESTAMP`, so one duplicate product
inside a batch can kill the whole batch. `skipDuplicates` is required.

### `ProductGroup` is a foreign key (1:N), not a join table

- `StoreProduct` carries a `productGroupId`; one group holds many store
  products.

**Why:** no use case exists for one product belonging to several groups at once.
The foreign key means one fewer join per query, which matters on mobile.

### The pgvector column is declared in the schema as `Unsupported()`

- `embedding vector(256)` was originally created only in the Neon SQL editor
  and left out of `schema.prisma`. A workflow step running
  `prisma db push --accept-data-loss` read that as drift and **dropped the
  column, destroying 98,595 embeddings.**
- Declaring it as `Unsupported("vector(256)")?` makes Prisma create and preserve
  the column. Prisma Client still cannot read it, so the embed and match scripts
  continue to use raw SQL.

**Why:** `db push` treats `schema.prisma` as the single source of truth.
Anything created outside that file is, by definition, drift to be removed. That
Prisma does not understand the type is not an exception to the schema-first
rule, because an escape hatch exists.

---

## Collection pipeline

### Playwright on GitHub Actions, not on Vercel

- Woolworths and Coles both block direct HTTP from AWS IP ranges, which is what
  Vercel serverless runs on.
- Playwright stealth runs on a GitHub Actions cron instead.

**Why:** browser automation clears the CDN and bot detection that raw HTTP
cannot. Vercel serverless could not run a browser regardless.

### Coles: Playwright stealth plus `__NEXT_DATA__`

- `playwright-extra` with `puppeteer-extra-plugin-stealth` to get past the
  Imperva challenge.
- Read `window.__NEXT_DATA__` after page load, rather than reverse-engineering
  an API.
- Three attempts with 4s and 7s backoff.

**Why:** Coles is a Next.js app, so `__NEXT_DATA__` exposes the full product
payload cleanly once a real browser has loaded the page.

### Scraping jobs are not allowed to migrate the schema

- Removed the `prisma db push --accept-data-loss` step from all four crons and
  did not replace it.
- When drift does occur, the first upsert throws and `scrape-report` exits
  non-zero, which is the signal that step was supposed to provide anyway.

**Why:** separation between deploying and working. A weekly scrape has no reason
to change the schema, and holding the *permission* to change it is what
destroyed 98,595 embeddings on 2026-08-12.

**Considered and deferred:** a read-only drift check (`migrate diff
--exit-code`). Manual DDL for `pg_trgm` lives outside the schema, so it would
always register as drift. Revisit once migrations are introduced.

### Matching runs on a fixed cron, not chained to the scrapers

- `match-products.yml` runs on a fixed Tuesday 23:00 UTC cron. It is not hung
  off the scrapers with `workflow_run`.

**Why:** matching needs the output of **all four** scrapers, but `workflow_run`
attaches to exactly one workflow. Attaching to the last one means matching never
runs in a week where that workflow fails; attaching to all four means it runs
four times. A fixed time sits an hour after the latest scraper (Coles specials,
Tuesday 21:30 plus a 30 minute ceiling), and if it does drift out of sync the
next week catches up incrementally, because matching is idempotent. Being a week
late is not a loss.

### Failure is judged by two thresholds, and individual `.catch` blocks stay

- A scraper was catching failures, logging them, and exiting 0. A run where all
  7,134 items failed was reported as `success`, because the completion log
  printed `products.length`, which is the number **attempted**.
- `lib/scrape-report.ts` now counts attempted, succeeded and failed per
  category, and exits 1 on **zero successes** or a **failure rate above 5%**.
  Identical causes are grouped by message and only the top three are printed.

**Why:** removing the `.catch` would throw away 7,000 products because of one.
The per-item catch was the right call; the bug was catching and then **not
counting**. A log is not a counter. Anything that only becomes information when
a human reads it is not information in an automated pipeline.

---

## Cross-store matching

### Brand normalisation is rule-based, with no LLM

`canonicalizeBrand()`: lowercase, hyphens to spaces, strip trademark symbols,
apostrophes and trailing punctuation.

**Why:** `export-brands.ts` pulled every pair above pg_trgm similarity 0.5 from
7,209 distinct brands, giving 1,315 pairs (`scripts/brands-export.json`). **The
pairs sampled from that set** all differed in formatting rather than meaning:
case, hyphens, punctuation. A rule is enough, at a fraction of the cost and
complexity of a model.

> **Correction, 2026-08-19.** This entry originally claimed that **all** 1,315
> pairs were formatting differences and that **no** case needed semantic
> judgement. That was not true. The 1,315 were generated by a script; only a
> sample was actually read. The overclaim had already reached a resume bullet
> before it was caught.
>
> Re-running `brands-export.json` through `canonicalizeBrand()` gives the real
> numbers:
>
> | | |
> |---|---|
> | Pairs above 0.5 similarity | 1,315 |
> | Collapsed by the rule | 274 |
> | Not collapsed | 1,041 (26 of them above 0.9) |
>
> Those 26 contain two different things. **Formatting the rule misses:**
> internal full stops (`Dr Oetker` / `Dr. Oetker`, `St Ives` / `St. Ives`),
> ampersand spacing (`TONI&GUY` / `Toni & Guy`, `L & P` / `L&P`), leading
> symbols (`*Lumiskin` / `Lumiskin`). And **genuinely different brands that
> string distance cannot separate:** `M&M's` / `M&S` at similarity **1.000**,
> `Miso Tasty` / `Tasty Miso`, `Mum` / `Mum-mum`, `Karicare` / `Karicare+`.
>
> **The conclusion does not change.** Rule-based is still correct and an LLM is
> still unnecessary. What changes is the scope of the evidence. `M&M's` / `M&S`
> is in fact the clearest argument for why the embedding stage has to exist at
> all.
>
> Open: whether to fold those 26 formatting cases into `canonicalize.ts`.
> Removing internal full stops and normalising spacing around `&` would catch
> most of them.

### Matching uses embeddings, not string similarity [REVERSED]

- Original plan: `normalizedName` with pg_trgm similarity above 0.7.
- Now: `normalizedName` with embedding cosine similarity, written to a
  `ProductGroup` table.

**Why:** pg_trgm measures string overlap only. "Woolworths Homebrand Milk 2L"
and "Coles Own Brand Full Cream Milk 2L" are the same product and score low.
Embeddings capture the semantic similarity that the names hide.

The pg_trgm GIN index stays in place; it still serves product search.

### Matches are precomputed into `ProductGroup`, not resolved at query time

**Why:**
- A vector search on every favourites page load is slow (81K by cosine).
- Precomputed groups are a single join.
- If a match turns out to be wrong the embeddings are still in the database, so
  only the threshold changes and groups regenerate at zero API cost.
- New products are matched incrementally on each scraper run.

### Embeddings are generated only for brands present in both stores

- The matching query joins on `w.canonical_brand = c.canonical_brand`, so a
  product whose brand exists in only one store can never produce a match.
- That is 36,229 of 98,805 products (36.7%), which is 36MB instead of 97MB.

**Why:** an embedding that cannot participate in a match does nothing except
consume storage. On Neon's 512MB free tier, 61MB is not a rounding error.

### Embedding dimension: 256, not 1536

- OpenAI `text-embedding-3-small` via the `dimensions` parameter.

**Why:** the Neon free tier caps at 512MB. At 1536 dimensions the vectors alone
would be 606MB; at 256 they are 101MB. Comparison only ever happens within a
single `canonicalBrand`, so the search space is already narrow. OpenAI's own
benchmarks put the quality difference at roughly one percentage point.

### Size is a hard gate on matching (`lib/unit.ts`)

- Brand was already a hard gate. Size was not, and `normalizedName` strips size,
  so embeddings had no way to tell 226g from 473mL. **18.2% of groups were
  comparing different products.**
- Pack structure is preserved: `375mL x 10 pack ≠ 3.75L`, `2x100g ≠ 200g`.
- When there is no size claim at all (`1EA`, `each`, empty), the gate
  **abstains** rather than rejecting.

**Why:** converting to a total makes a ten-can pack equal to one large bottle.
And one store failing to state a size is not evidence of a mismatch, so
rejecting on it loses real matches and gains nothing.

### Similarity threshold: 0.95 chosen, 0.92 currently in code, neither validated

Observed while tuning:

| Threshold | What it did |
|---|---|
| 0.85 | Many wrong matches: Tim Tam Mangoes to Caramel, Cadbury Sticky Toffee to Raspberry |
| 0.93 | Still wrong: Huggies Boys to Girls, Noshu 97% to 95% |
| 0.95 | Mostly correct, including genuine naming differences (Val Verde Passata Sauce to Cooking Sauce) |

**Why 0.95 originally:** a wrong `ProductGroup` shows a shopper the wrong
product, so the false-positive direction is the expensive one. Start
conservative, then tune against labelled pairs. Lowering a threshold later
preserves existing groups and only adds matches.

**Current state, and it is a known gap.** `SIMILARITY_THRESHOLD` in
`scripts/match-products.ts` is **0.92**, and that number has no evidence behind
it. A regeneration on 08-15 turned up pairs just above the line differing only
in flavour (`Dry Dog Food with Beef` against `with Chicken`). The threshold is
the one constant in the matching pipeline that has never been validated.

**Planned:** hand-label roughly 100 known cross-store pairs, measure precision
and recall across the range, and pick the threshold off the curve rather than by
eye. The 0.92 to 0.94 band is where the labelling effort should concentrate.

### pgvector on Neon, with no separate vector database

**Why:** Neon supports the pgvector extension natively, so relational and vector
queries run against one database. No Pinecone or Weaviate to operate. 81K
vectors fit inside the free tier.

---

## Storage and cost

### Reclaiming space is a question of order, not of what to delete

- Neon's limit is 512MB and the database was at 490MB. `VACUUM FULL` needed 88MB
  of headroom to reclaim 66MB of dead rows, and only 22MB was free. This was
  closed once as impossible.
- It was not. Dropping two unused indexes (52MB and 84MB) first opened a
  **158MB window**, and `VACUUM FULL` was only possible inside it. Reversing the
  order, creating the primary key first, shrinks the window to 82MB and fails.

**Why this is worth recording:** looking at each step in isolation never finds
it. The same set of operations succeeds or fails purely on ordering, so when a
resource is tight the intermediate states between steps are the thing to look
at. This is why the script now prints actual sizes at every stage: the estimates
were wrong both times (66MB turned out to be 109MB, 76MB turned out to be 62MB).

### Vercel image optimisation is off everywhere

- The free tier allows 5,000 transformations per month. Roughly 77K products
  with images would exhaust that in a single page load.

**Why:** cost control. Raw CDN URLs still load; what is lost is Next.js resizing
and WebP conversion.

### Database: Neon PostgreSQL

**Why:** native Vercel integration, a free tier that holds ~77K products, and
`pg_trgm` support for fuzzy product name search.

---

## Interface

### A single function decides what counts as a sale (`isRealDeal` in `lib/deal.ts`)

- Six call sites each decided independently that "a `currentDeal` exists,
  therefore it is on sale". **30% of Coles specials carry a zero discount**, so
  all six were wrong.
- Comparison happens in integer cents (`Math.round(n*100)`). In floating point
  `5.00 - 4.99` becomes `0.00999...`, so a `>= 0.01` test discards genuine
  one-cent discounts.
- Declared as a type predicate (`deal is T & { originalPrice: number }`) so call
  sites narrow without a non-null assertion.

**Why:** an unnamed assumption gets copied. Pulling one judgement back into one
place means there is also one place to fix it. Comparing in cents aligns the
test with the two-decimal value the interface actually displays.

### The chart is given the current price; it does not infer one

- `CrossStorePriceChart` was treating the last `PriceHistory` row as "the price
  now". **In 97.3% of cases the two stores' series end on different dates**, so
  it was comparing stale against fresh.
- The page already computes `effectivePrice` to render the card, so it now
  passes that down and the chart pins today's point to it.

**Why:** deriving the same number in two places guarantees they diverge
eventually. One side computing and the other receiving makes the mismatch
structurally impossible. `PriceHistory` is an archive with gaps, so it is used
only for the shape of the past.

### The price graph leads with a verdict, not with the raw series

- A "Cheapest at X right now" verdict on top, the overlaid comparison chart and
  a low-price baseline underneath.

**Why:** measured against real `PriceHistory` data, **49% of products have never
changed price and 76% have two or fewer distinct prices.** For most products the
series is a flat line carrying no information. The question actually being asked
in a supermarket aisle is "should I buy this now", and a bare time series hands
that analysis back to the shopper. The chart stays, because trend is still a
good visual cue, but the conclusion comes first.

### One low-price baseline across both stores, not one per store

**Why:** per-store baselines give the reader two different yardsticks, so the
more expensive store sitting at its own floor looks like a good price. A single
line measures both against the same standard, and it cuts the chart from four
lines to one, which is what makes it readable on a narrow phone canvas.

### Range selector buttons appear based on how much data exists

- Only ranges where `r.days < spanDays` render. At 3.2 months of data that means
  1M, 3M and All.

**Why:** a 6M button that returns exactly what All returns reads as broken. As
history accumulates, 6M and 1Y appear on their own with no code change.

### Chart colours prioritise colour-blind separation over brand colours

- Light overlay: `#166534` for Woolworths, `#f8776a` for Coles.
- Verified by `validate_palette.js`: ΔE 17.0 under protanopia, 36.0 in normal
  vision.

**Why:** the brand colours, green `#16a34a` against red `#dc2626`, sit at
**ΔE 5.0** under red-green colour blindness, which is effectively the same line
twice. No green-to-red or green-to-orange pairing survives if the two are
similar in lightness, so the fix is to separate them by lightness: hue collapses
under CVD, lightness does not. Colour is not load-bearing on its own either, as
the legend, per-store numeric labels and different endpoint shapes (square
against circle) all carry the same distinction.

### The CHEAPEST badge is charcoal

- `bg-gray-900` with white text.

**Why:** green belongs to Woolworths and red to Coles, so either one reads as
"which store" rather than "which is cheaper". Matcha green has the same problem
by association. Charcoal is already the app's default button colour, so it
carries no store meaning.

### Cross-store products get their own detail page (`/product-group/[id]`)

- Matched products open a combined page. Unmatched products keep the existing
  `/store-product/[id]`.

**Why:** merging search result cards by `ProductGroup` forces a choice of which
store is "representative", and that was falling out alphabetically. The same
product would open with Woolworths' image and page while Coles was demoted to a
price number. Once two products are judged identical, they should be presented
as equals.

### Failure is not rendered as emptiness

- `.then(r => r.ok ? r.json() : [])` appeared in four places. With only
  `loading` and `empty` states, a failure had nowhere to go and was absorbed
  into `empty`, so **a failed request made a saved watchlist look deleted.**
- Failures now throw, and the interface has four states: `loading`, `error`,
  `empty`, `data`. The three optimistic updates (heart toggle and two removal
  paths) roll back on failure.
- The server had the same bug: `DELETE /api/favorites` swallowed every error and
  returned `{ok:true}`. Now only `P2025` (already gone) counts as success and
  anything else is a 500.

**Why:** all six sites *were* catching the error. The bug was converting it into
an empty value and letting it continue down the success path, which no review
that counts `.catch` blocks will ever find. Layers also have to be fixed
**outside first**: the server's `{ok:true}` was only discovered after all the
client rollbacks were in place, and in the other order the client work would
have functioned from the start.

### Page state lives in the URL [REVERSED]

- Deals uses `?store`, `?page`, `?category`, `?discount`; favourites search uses
  `?q=`. Updated with `router.replace` so filter changes do not pile up in
  history.

**Why:** the previous sessionStorage approach persisted `displayCount` and
scroll position but not `selectedStore`, so returning from a detail page always
landed on the alphabetically first store (Coles). Putting state in the URL lets
the browser restore it, makes links shareable, and solved the problem without
giving up load-more.

### Only the main page sits in a `(browse)` route group

- Adding `app/loading.tsx` made `notFound()` start returning **200** instead of
  404. With a `loading.tsx` present, Next begins streaming immediately, so the
  200 header is already sent by the time the missing product is discovered and
  the status can no longer change. All three detail routes were affected.
- Moving `app/page.tsx` to `app/(browse)/page.tsx` and putting `loading.tsx`
  inside it fixes both. Parenthesised folders do not appear in the URL, so the
  address stays `/` and detail routes no longer stream.

**Why:** both alternatives give something up. No loading state means a blank
white screen; a 200 on a missing product breaks machine readability. A route
group keeps both by changing only where the file lives.

**The general lesson:** a pure addition is still a change. `loading.tsx`
modified nothing and still altered status codes, and without actually
re-checking it would have shipped.

---

## Accounts

### Favourites require an account [REVERSED]

- Previously: logged out went to localStorage, and merged into the database on
  first login.
- Now: clicking the heart while logged out redirects to `/login`. Database only.

**Why:** consistency and cross-device sync. The core flow this app exists for is
"add it at home, look at it in the store", which assumes an account anyway.
Removing the merge path also removes a set of edge cases that only ever existed
to support it.

### Sessions are JWT, not database-backed

- NextAuth v5 JWT strategy, 30 day `maxAge`.

**Why:** no session table to poll, simpler setup, and appropriate for an
application at this scale.
