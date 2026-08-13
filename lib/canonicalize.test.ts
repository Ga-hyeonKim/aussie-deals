import { describe, expect, it } from "vitest"
import { canonicalizeBrand } from "./canonicalize"

/**
 * The join key for cross-store matching. scripts/match-products.ts:36-56 joins
 * Woolworths to Coles on canonical_brand alone, so a brand these two stores
 * spell differently is a pair that never gets considered at all.
 */
describe("canonicalizeBrand", () => {
  describe("absence", () => {
    it("maps every kind of missing brand to null", () => {
      expect(canonicalizeBrand(null)).toBeNull()
      expect(canonicalizeBrand(undefined)).toBeNull()
      expect(canonicalizeBrand("")).toBeNull()
      expect(canonicalizeBrand("   ")).toBeNull()
    })

    it("returns null when nothing survives stripping", () => {
      // Not "", which would become a join key that groups unrelated products.
      expect(canonicalizeBrand("®")).toBeNull()
    })
  })

  describe("normalising", () => {
    it("drops trademark symbols", () => {
      expect(canonicalizeBrand("Milo®")).toBe("milo")
    })

    it("drops both straight and curly apostrophes", () => {
      expect(canonicalizeBrand("Arnott's")).toBe("arnotts")
      expect(canonicalizeBrand("Arnott’s")).toBe("arnotts")
    })

    it("turns hyphens into spaces", () => {
      expect(canonicalizeBrand("Coca-Cola")).toBe("coca cola")
    })

    it("strips trailing sentence punctuation but keeps it mid-brand", () => {
      expect(canonicalizeBrand("Dr. Oetker.")).toBe("dr. oetker")
    })
  })

  it("lands the same brand on one key however the two stores spell it", () => {
    const spellings = ["Arnott's", "Arnott’s", "ARNOTTS", "arnotts "]
    const keys = new Set(spellings.map(canonicalizeBrand))
    expect(keys).toEqual(new Set(["arnotts"]))
  })
})
