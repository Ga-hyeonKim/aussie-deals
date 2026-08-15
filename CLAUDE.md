<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# AussieDeals

Weekly grocery deals aggregator for Woolworths & Coles (AU). Learning project.

**Current state, constraints and open debt: `STATE.md`. Read it before answering
anything about how the project is built.** This file holds only what is always
true.

## Invariants

Every one of these was learned by shipping the opposite. **Re-read this list when
adding a store, a data source, or a new dimension** — that is when assumptions
from a narrower world quietly expire.

- **A `Product` row does not mean the item is discounted.** Coles lists
  no-discount items on `/on-special`. Use `isRealDeal()` from `lib/deal.ts`;
  never test `if (deal)` alone.
- **`PriceHistory` is an incomplete archive, not a price feed.** Rows are
  missing, duplicated per day, and each store's series ends on a different day.
  Never read the current price from its last row.
- **Same name does not mean same product.** Size must match too, and it lives in
  the separate `unit` column — most names never carry it, so the embedding
  cannot see it. Gate with `sameSize()` from `lib/unit.ts`.
- **Coles `MULTI_SAVE` promotions have `originalPrice = null`.** Null means "no
  discount known", never "free".
- **A scrape job never migrates the schema.** No `prisma db push` in a workflow.
- **Scrapers cannot run on Vercel.** Both stores block AWS IP ranges, and
  serverless cannot run a browser. GitHub Actions only.
- **Product images stay `unoptimized`.** Vercel's free tier caps image
  transforms at 5,000/month; ~77K products would exhaust it in one page load.
- **Keep concurrent DB writes ≤ 5** during scraper runs. Neon's free tier has a
  low connection ceiling.

## Working agreements

- **Name assumptions as functions.** `if (currentDeal)` meaning "on sale" is a
  claim with no name, and unnamed claims get copy-pasted. A named predicate is
  one place to correct.
- **Measure before fixing.** Count how many rows are affected and compare across
  stores — an asymmetry (Woolworths 0%, Coles 30%) localises a bug faster than
  reading code does.
- **Invariants belong in `lib/` tests, not only in this list.** A rule that is
  only prose here gets re-implemented inline somewhere else. If you can name it,
  write the case.
- **Mobile wins.** Primary use is a phone in-store. Tap targets ≥ 44px.
- **Explain-back before push.** Ask Gahyeon to explain what changed, in their own
  words, before anything goes to the remote. If the answer is thin, that is the
  spot to drill — not a separate study session. Claude raises this; Gahyeon
  should not have to remember it.

## Playbooks

Loaded on demand, not here:

| Working on | Skill |
|---|---|
| Scrapers, adding a store, anti-bot | `scraper-work` |
| `schema.prisma`, migrations, pgvector | `db-schema` |
| Narrowing down a bug, writing it up | `debug-log` |
| Ending a session | `session-wrap` |

## Where things are written down

| Question | File |
|---|---|
| Where does the project stand? | `STATE.md` |
| Why was it done this way? | `DECISIONS.md` |
| What broke before, and how was it found? | `DEBUGGING.md` |
| What's next? | `TODO.md` (gitignored) |
| What happened when? | `SESSION_NOTES.md` (gitignored) |
| What changed for users? | `CHANGELOG.md` |

One fact, one home. If it belongs in two, it belongs in the more specific one.
