import { describe, it } from "vitest"
// import { expect } from "vitest"
// import { parseSize, sameSize } from "./unit"

/**
 * CLAUDE.md invariant #3 ("same name does not mean same product"), made
 * executable. Replace each `it.todo(...)` with a real case.
 *
 * The three-valued return is the part that matters: scripts/match-products.ts:71-79
 * rejects a pair only when sameSize returns exactly `false`, and keeps it on
 * `null`. If null ever collapsed into false, cross-store matching would quietly
 * throw away good pairs; if it collapsed into true, the 18% wrong-group rate
 * that gate was built to fix comes back.
 */
describe("sameSize", () => {
  it.todo("abstains with null when one side makes no size claim")

  it.todo("abstains with null when neither side makes a size claim")

  it.todo("'each' and '' are not size claims")

  it.todo("1L and 1000mL are the same pack")

  it.todo("226g and 473mL are different packs — the case from the module doc")

  it.todo("375mL x 10 pack is NOT 3.75L — ten cans are not one big bottle")

  it.todo("2x100g and 200g are different — read key() and decide which it should be")
})

describe("parseSize", () => {
  it.todo("returns null rather than throwing on a format it has not seen")

  it.todo("mg conversion does not leave float noise in the key")
})
