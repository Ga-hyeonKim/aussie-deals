import { describe, expect, it } from "vitest"
import { isRealDeal } from "./deal"

/** CLAUDE.md invariants #1 and #4, made executable. */
describe("isRealDeal", () => {
  it("rejects a Product row that carries no discount", () => {
    // Coles lists these on /on-special, which is why the row existing proves nothing.
    expect(isRealDeal({ salePrice: 5.0, originalPrice: 5.0 })).toBe(false)
  })

  it("treats originalPrice: null as 'no discount known', not as free", () => {
    // Coles MULTI_SAVE promotions arrive this way.
    expect(isRealDeal({ salePrice: 3.5, originalPrice: null })).toBe(false)
  })

  it("rejects null and undefined", () => {
    expect(isRealDeal(null)).toBe(false)
    expect(isRealDeal(undefined)).toBe(false)
  })

  it("rejects a sale price above the original", () => {
    expect(isRealDeal({ salePrice: 6.0, originalPrice: 5.0 })).toBe(false)
  })

  it("accepts a one cent saving — the boundary", () => {
    expect(isRealDeal({ salePrice: 4.99, originalPrice: 5.0 })).toBe(true)
  })

  it("narrows originalPrice to number when it returns true", () => {
    const deal: { salePrice: number; originalPrice: number | null } =
      { salePrice: 4.0, originalPrice: 5.0 }
    if (isRealDeal(deal)) {
      // Compiles only because the type predicate removed null.
      expect(deal.originalPrice.toFixed(2)).toBe("5.00")
    } else {
      throw new Error("expected a deal")
    }
  })

  describe("why the comparison runs in cents", () => {
    it("rejects a saving too small to display, which a float comparison would accept", () => {
      // scripts/fetch-coles.ts:261 re-implements this predicate as
      //   originalPrice !== null && salePrice < originalPrice
      // On this pair those two disagree: 5.001 < 5.002 is true, so the inline
      // version calls it a deal, but both prices render as $5.00. A saving the
      // user cannot see is not a saving.
      expect(5.001 < 5.002).toBe(true)
      expect(isRealDeal({ salePrice: 5.001, originalPrice: 5.002 })).toBe(false)
    })

    it("accepts a real one cent saving that float subtraction would round away", () => {
      // 5.10 - 5.09 is 0.009999999999999787, so `diff >= 0.01` would say no.
      expect(5.1 - 5.09 >= 0.01).toBe(false)
      expect(isRealDeal({ salePrice: 5.09, originalPrice: 5.1 })).toBe(true)
    })
  })

  it("accepts anything shaped like a deal, including narrowed selects", () => {
    const fromSelect = { salePrice: 2.5, originalPrice: 4.0, name: "Milk" }
    expect(isRealDeal(fromSelect)).toBe(true)
  })
})
