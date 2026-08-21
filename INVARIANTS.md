# Invariants

Rules about this domain that are not obvious from the code, and that break
things quietly when ignored. **Every one of them was learned by shipping the
opposite.**

Re-read this list when adding a store, a data source, or a new dimension. That
is the moment assumptions from a narrower world quietly expire.

---

### A `Product` row does not mean the item is discounted

Coles lists items with no discount on `/on-special`, and around 30% of that feed
carries a zero saving. Use `isRealDeal()` from `lib/deal.ts`. Never test
`if (deal)` on its own.

### `PriceHistory` is an incomplete archive, not a price feed

Rows go missing, a single day can hold duplicates, and each store's series ends
on a different date (they disagree in 97.3% of cases). Never read the current
price from its last row. Use it for the shape of the past and nothing else.

### Same name does not mean same product

Size has to match as well, and size lives in a separate `unit` column. Most
product names never contain it, which means the embedding cannot see it at all.
Gate with `sameSize()` from `lib/unit.ts`.

Pack structure counts: `375mL x 10 pack` is not `3.75L`, and `2x100g` is not
`200g`.

### Coles `MULTI_SAVE` promotions have `originalPrice = null`

Null means "no discount known". It never means free.

### A scrape job never migrates the schema

No `prisma db push` inside a workflow. A run that held that permission once
dropped a column and destroyed 98,595 embeddings.

### Scrapers cannot run on Vercel

Both stores block AWS IP ranges, and serverless cannot run a browser. GitHub
Actions only.

### Product images stay `unoptimized`

Vercel's free tier caps image transforms at 5,000 per month. Roughly 77K
products would exhaust that in a single page load.

### Keep concurrent database writes at five or fewer during scraper runs

Neon's free tier has a low connection ceiling.

---

## Working agreements

**Name assumptions as functions.** `if (currentDeal)` meaning "on sale" is a
claim with no name, and unnamed claims get copy-pasted. A named predicate gives
you one place to correct.

**Measure before fixing.** Count how many rows are affected and compare across
stores. An asymmetry (Woolworths 0%, Coles 30%) localises a bug faster than
reading code does.

**Invariants belong in `lib/` tests, not only in this list.** A rule that exists
only as prose here gets reimplemented inline somewhere else. If you can name it,
write the case.

**Mobile wins.** The primary use is a phone in a supermarket aisle. Tap targets
at 44px or larger.

---

Related: [`DECISIONS.md`](DECISIONS.md) for why the architecture is shaped this
way.
