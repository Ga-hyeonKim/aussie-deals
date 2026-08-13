import { describe, it } from "vitest"
// import { expect } from "vitest"
// import { isRealDeal } from "./deal"

/**
 * CLAUDE.md invariant #1 and #4, made executable.
 *
 * These are `it.todo` on purpose — the cases are yours to write. Replace each
 * `it.todo("...")` with `it("...", () => { ... })`.
 *
 * Worth knowing before you start: scripts/fetch-coles.ts:261 re-implements this
 * predicate inline as `p.originalPrice !== null && p.salePrice < p.originalPrice`,
 * comparing floats where isRealDeal compares cents. Once these tests exist we
 * can replace that line and the tests will say whether the two ever disagreed.
 */
describe("isRealDeal", () => {
  it.todo("a Product row on /on-special with no discount is not a deal")

  it.todo("originalPrice: null (Coles MULTI_SAVE) means 'no discount known', not free")

  it.todo("null and undefined are not deals")

  it.todo("equal sale and original prices are not a deal")

  it.todo("a sale price above the original is not a deal")

  it.todo("one cent cheaper is a deal — find the exact boundary")

  it.todo(
    "a price pair where naive float subtraction disagrees with the cents comparison " +
    "— this is the case that justifies `cents()` existing, so if you cannot find one, " +
    "that is a finding worth writing down"
  )
})
