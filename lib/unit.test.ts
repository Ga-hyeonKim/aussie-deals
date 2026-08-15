import { describe, expect, it } from "vitest"
import { parseSize, sameSize } from "./unit"

/**
 * CLAUDE.md invariant #3 — same name does not mean same product.
 *
 * The three-valued return is the part that matters. scripts/match-products.ts:71-79
 * rejects a candidate pair only when sameSize returns exactly `false`, and keeps
 * it on `null`. Collapsing null into false would throw away good pairs; into
 * true would bring back the 18% wrong-group rate this gate was built to fix.
 */
describe("sameSize", () => {
  describe("abstaining", () => {
    it("returns null when one side makes no size claim", () => {
      expect(sameSize("500g", null)).toBeNull()
      expect(sameSize(null, "500g")).toBeNull()
    })

    it("returns null when neither side makes a claim", () => {
      expect(sameSize(null, undefined)).toBeNull()
    })

    it("does not treat 'each' or '' as a size claim", () => {
      expect(sameSize("each", "500g")).toBeNull()
      expect(sameSize("", "500g")).toBeNull()
    })

    it("abstains rather than rejecting on a format it does not recognise", () => {
      expect(sameSize("banana", "500g")).toBeNull()
    })
  })

  describe("matching", () => {
    it("sees through the unit: 1L is 1000mL", () => {
      expect(sameSize("1L", "1000mL")).toBe(true)
    })

    it("sees through the unit: 500mg is 0.5g", () => {
      expect(sameSize("500mg", "0.5g")).toBe(true)
    })
  })

  describe("rejecting", () => {
    it("separates a 226g tub from a 473mL bottle", () => {
      // The pair from the module doc: both reduce to the same normalized name,
      // so this test is the only thing keeping them apart.
      expect(sameSize("226g", "473mL")).toBe(false)
    })

    it("does not confuse ten cans with one big bottle", () => {
      expect(sameSize("375mL x 10 pack", "3.75L")).toBe(false)
    })

    it("does not confuse a 2-pack with a single of twice the size", () => {
      expect(sameSize("2x100g", "200g")).toBe(false)
    })
  })
})

describe("parseSize", () => {
  it("returns null rather than throwing on an unknown format", () => {
    expect(parseSize("banana")).toBeNull()
    expect(parseSize("each")).toBeNull()
    expect(parseSize("")).toBeNull()
    expect(parseSize(null)).toBeNull()
  })

  it("keeps the pack count separate from the per-item measure", () => {
    expect(parseSize("375mL x 10 pack")).toBe("v:375x10")
    expect(parseSize("2x100g")).toBe("m:100x2")
  })

  it("parses a bare count with no measure", () => {
    expect(parseSize("6 pack")).toBe("c:6x1")
    expect(parseSize("12pk")).toBe("c:12x1")
  })

  it("rounds away the float noise that mg conversion produces", () => {
    // 0.001 * 500 does not land exactly on 0.5 without the rounding in key().
    expect(parseSize("500mg")).toBe(parseSize("0.5g"))
    expect(parseSize("500mg")).toBe("m:0.5x1")
  })

  it("is insensitive to case and spacing", () => {
    expect(parseSize("1L")).toBe(parseSize("1 l"))
  })
})
