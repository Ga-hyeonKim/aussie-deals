import { describe, it } from "vitest"
// import { expect } from "vitest"
// import { canonicalizeBrand } from "./canonicalize"

/**
 * The join key for cross-store matching — scripts/match-products.ts:36-56 joins
 * Woolworths to Coles on canonical_brand alone, so anything this gets wrong is
 * a pair that never gets considered at all.
 *
 * Replace each `it.todo(...)` with a real case.
 *
 * Note while writing these: scripts/backfill-canonical-brand.ts:14-24 carries a
 * second, hand-copied implementation of this function. These tests only cover
 * the one in lib/. Deleting the copy and importing this module is the fix, and
 * these tests are what make that safe.
 */
describe("canonicalizeBrand", () => {
  it.todo("null, undefined and '' are all null — no brand, not an empty brand")

  it.todo("whitespace-only is null")

  it.todo("a brand that is nothing but strippable characters comes back null")

  it.todo("drops ® and ™")

  it.todo("drops both straight and curly apostrophes — Arnott's and Arnott’s agree")

  it.todo("turns hyphens into spaces")

  it.todo("strips trailing . ! ? but not ones in the middle")

  it.todo("the same brand written two ways by the two stores lands on one key")
})
