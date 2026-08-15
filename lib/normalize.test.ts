import { describe, expect, it } from "vitest"
import { normalizeName } from "./normalize"

/** What the embedding in scripts/embed-products.ts:148 actually sees. */
describe("normalizeName", () => {
  describe("brand prefix", () => {
    it("strips a leading brand", () => {
      expect(normalizeName("Cadbury Dairy Milk", "Cadbury")).toBe("dairy milk")
    })

    it("strips it regardless of case on either side", () => {
      expect(normalizeName("CADBURY Dairy Milk", "cadbury")).toBe("dairy milk")
    })

    it("only strips at the start, never mid-name", () => {
      expect(normalizeName("Milk Cadbury Block", "Cadbury")).toBe("milk cadbury block")
    })

    it("handles a brand containing regex metacharacters", () => {
      // Without escapeRegex the parentheses would make this a capture group.
      expect(normalizeName("Coles (Brand) Milk", "Coles (Brand)")).toBe("milk")
    })

    it("leaves the name alone when no brand is given", () => {
      expect(normalizeName("Cadbury Dairy Milk")).toBe("cadbury dairy milk")
    })
  })

  describe("tidying", () => {
    it("joins a split size so '500 g' matches '500g'", () => {
      expect(normalizeName("Milk 500 g")).toBe("milk 500g")
      expect(normalizeName("Milk 500g")).toBe("milk 500g")
    })

    it("drops trademark symbols", () => {
      expect(normalizeName("Milo® Drink")).toBe("milo drink")
    })

    it("collapses repeated whitespace and trims", () => {
      expect(normalizeName("  Milk   Full  Cream ")).toBe("milk full cream")
    })
  })

  describe("size is not stripped", () => {
    it("keeps a size that the name itself carries", () => {
      // lib/unit.ts:5-8 and CLAUDE.md both say normalizedName "strips the size"
      // and that a 226g tub and a 473mL bottle "both normalise to
      // 'daily advance lotion'". They do not — when the name carries the size,
      // it survives, and the embedding can see it:
      expect(normalizeName("Nivea Daily Lotion 473mL", "Nivea")).toBe("daily lotion 473ml")
      expect(normalizeName("Nivea Daily Lotion 226g", "Nivea")).toBe("daily lotion 226g")
      expect(normalizeName("Nivea Daily Lotion 473mL", "Nivea"))
        .not.toBe(normalizeName("Nivea Daily Lotion 226g", "Nivea"))
    })

    it("only loses the size when the name never carried it", () => {
      // This is the real gap the sameSize() gate covers. Two listings of
      // genuinely different products collide here because neither name
      // mentions the size — it lives in the separate `unit` column.
      const tub = normalizeName("Nivea Daily Advance Lotion", "Nivea")     // unit: "226g"
      const bottle = normalizeName("NIVEA Daily Advance Lotion", "nivea")  // unit: "473mL"
      expect(tub).toBe(bottle)
      expect(tub).toBe("daily advance lotion")
    })
  })
})
