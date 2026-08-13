---
name: scraper-work
description: Working on any scraper in scripts/fetch-*.ts, adding a new store, debugging a bot-block or Imperva challenge, or changing how scraped rows are written to the DB. Load before editing a scraper.
---

# Scraper work

## Adding a new store — the ladder

Woolworths and Coles use different techniques. They are not two facts to
memorise; they are two rungs of one ladder. **Always climb down from the most
structured source, because that is the order of "least likely to break".**

1. **Is there a JSON API?** Open DevTools → Network, page through a category.
   If XHR carries the product data, that is the Woolworths path.
   - Then ask: can the request be reproduced? Call it with `page.evaluate` from
     *inside* the page, not from Node — that way it carries the browser's
     session, cookies and origin, and looks like the site talking to itself.
2. **Is there an SSR payload?** View source and look for embedded state.
   Next.js → `window.__NEXT_DATA__`. Nuxt → `window.__NUXT__`. That is the
   Coles path. More stable than the DOM: class names change, data shape does not.
3. **Neither?** Only then parse the DOM. Weakest option — breaks on any markup
   change.
4. **Separately, check for bot detection** (Imperva, Cloudflare). Determines
   whether stealth is needed at all.

Also re-read the Invariants in `CLAUDE.md` before starting. A third store is
exactly when assumptions built from two stores expire.

## Woolworths pattern (`fetch-woolworths.ts`, `fetch-woolworths-all.ts`)

- `page.evaluate` → `POST /apis/ui/browse/category` with `categoryId`,
  `pageNumber`, `pageSize: 36`, `isSpecial: true|false`.
- Termination: `Math.ceil(TotalRecordCount / pageSize)`, plus a zero-product
  guard. 300ms between pages (150ms in the catalogue script).
- 15 hardcoded category IDs, duplicated verbatim across both scripts.

## Coles pattern (`fetch-coles.ts`, `fetch-coles-all.ts`)

- `playwright-extra` + `puppeteer-extra-plugin-stealth` — patches the
  fingerprint markers headless Chrome leaks. Context is built to look normal:
  real Chrome UA, `locale: "en-AU"`, `Accept-Language: en-AU,en;q=0.9`.
- `page.goto(..., { waitUntil: "load" })` then read `window.__NEXT_DATA__`.
- **Challenge detection**: the payload comes back without `searchResults`.
  3 attempts, 4s/7s backoff, `page.reload()` between.
  Do not raise the retry count — repeated retries against a bot wall invite a
  harder block, burn GHA minutes, and look like an attack.
- **Pagination gotcha**: page N URL is `page.url().split("?")[0] + "?page=N"`.
  Using the base constant loses the `/en/` redirect.
- Intermediate dump JSON + `--from-json` to re-run the DB half without scraping.
  Use this when testing write-path changes.

## Writing to the DB

- Batches of 50 (`fetch-coles*`) or 100 sliced into chunks of 10
  (`fetch-woolworths-all`). Keep concurrent writes ≤ 5–10; Neon's free tier has
  a low connection ceiling.
- `await prisma.$queryRaw\`SELECT 1\`` before a batch loop to warm Neon from
  cold start.
- `priceHistory.createMany({ skipDuplicates: true })` per batch — one batch
  shares one timestamp, so duplicates are real.
- `fetch-woolworths.ts` is the outlier: fully serial, 3 round-trips per product,
  `priceHistory.create` one row at a time. Known, not yet fixed.

## Failure reporting

Every scraper must go through `createScrapeReport()` from `lib/scrape-report.ts`
and let its exit code stand. A scraper that catches per-item errors and still
exits 0 is the 2026-08-12 failure: the workflow went green while writing zero
`price_history` rows. The report fails the run when a kind of work saved nothing
or exceeded a 5% failure rate.

## Known state

~330–400 of the 1,327 scraper lines are near-verbatim copies across the four
files (Neon bootstrap, `fmt()`, `deduplicate()`, `getWeekRange()`, the batch
loop, `--from-json` parsing). **The time to extract a shared kernel is when a
third store is added**, not before — these scripts run fine and are rarely
touched. See `STATE.md` for the full debt list.
