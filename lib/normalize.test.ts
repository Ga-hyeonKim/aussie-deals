import { describe, it } from "vitest"
// import { expect } from "vitest"
// import { normalizeName } from "./normalize"

/**
 * What the embedding actually sees. Replace each `it.todo(...)` with a real case.
 *
 * One thing to settle while writing these: lib/unit.ts:5-8 and CLAUDE.md both
 * say normalizedName "strips the size". Read normalize.ts — it lowercases,
 * drops ®™©, and joins "500 g" into "500g", but it never removes a size. The
 * size gap those docs describe is real, but it comes from size living in the
 * separate `unit` column rather than from this function stripping anything.
 * A test that pins the actual behaviour is how that gets settled; if you agree,
 * the wording in both places is worth correcting.
 */
describe("normalizeName", () => {
  it.todo("strips a leading brand prefix")

  it.todo("strips the brand regardless of case")

  it.todo("does NOT strip the brand from the middle of a name")

  it.todo("handles a brand containing regex characters without throwing")

  it.todo("joins '500 g' into '500g'")

  it.todo("leaves a size that is already joined alone")

  it.todo("collapses repeated whitespace and trims")

  it.todo("keeps a size that appears in the name — see the note above")
})
