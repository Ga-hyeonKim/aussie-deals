import { describe, expect, it, vi } from "vitest"
import { createScrapeReport } from "./scrape-report"

/**
 * Ported from scripts/test-scrape-report.ts, which was run by hand and so was
 * only ever green when someone remembered to look.
 *
 * The point of the module is to turn a silent failure into a non-zero exit, so
 * the boundary is what gets tested — not the formatting. The two cases at the
 * bottom used to print and ask a human to read the output; they now assert.
 */

type Build = (r: ReturnType<typeof createScrapeReport>) => void

/**
 * `finish()` writes to process.exitCode, which would leak into vitest's own
 * exit status. Capture the lines, capture the verdict, restore everything.
 */
function run(build: Build) {
  const before = process.exitCode
  process.exitCode = 0

  const lines: string[] = []
  const log = vi.spyOn(console, "log").mockImplementation((...a) => void lines.push(a.join(" ")))
  const err = vi.spyOn(console, "error").mockImplementation((...a) => void lines.push(a.join(" ")))

  const report = createScrapeReport("test")
  build(report)
  const healthy = report.finish()
  const exitCode = process.exitCode

  log.mockRestore()
  err.mockRestore()
  process.exitCode = before

  return { healthy, exitCode, lines }
}

/** The return value and the exit code are two claims about the same thing. */
function verdictOf(build: Build): boolean {
  const { healthy, exitCode } = run(build)
  expect(healthy).toBe(exitCode === 0)
  return healthy
}

describe("a clean run", () => {
  it("is healthy when everything saved", () => {
    expect(verdictOf(r => {
      r.ok("storeProduct", 100)
      r.ok("priceHistory", 100)
    })).toBe(true)
  })
})

describe("2026-08-12: saved nothing", () => {
  it("fails when a kind saved nothing despite being attempted", () => {
    expect(verdictOf(r => {
      r.ok("storeProduct", 7134)
      r.fail("priceHistory", new Error("The column `id` does not exist"), 7134)
    })).toBe(false)
  })
})

describe("partial collapse", () => {
  it("tolerates 4% failed", () => {
    expect(verdictOf(r => {
      r.ok("storeProduct", 96)
      r.fail("storeProduct", new Error("timeout"), 4)
    })).toBe(true)
  })

  it("fails at 6%", () => {
    expect(verdictOf(r => {
      r.ok("storeProduct", 94)
      r.fail("storeProduct", new Error("timeout"), 6)
    })).toBe(false)
  })

  it("treats exactly 5% as healthy — the threshold is strictly greater", () => {
    expect(verdictOf(r => {
      r.ok("storeProduct", 95)
      r.fail("storeProduct", new Error("timeout"), 5)
    })).toBe(true)
  })
})

describe("nothing attempted", () => {
  it("is healthy for an empty report", () => {
    expect(verdictOf(() => {})).toBe(true)
  })

  it("does not fail a run over a kind that was never touched", () => {
    expect(verdictOf(r => {
      r.ok("storeProduct", 10)
      // "category" never touched
    })).toBe(true)
  })
})

describe("one bad kind fails the whole run", () => {
  it("fails even when another kind saved everything", () => {
    expect(verdictOf(r => {
      r.ok("storeProduct", 1000)
      r.fail("priceHistory", new Error("boom"), 1000)
    })).toBe(false)
  })
})

describe("output stays readable", () => {
  it("collapses 3000 identical errors into one line", () => {
    const { lines } = run(r => {
      r.ok("storeProduct", 1)
      for (let i = 0; i < 3000; i++) r.fail("priceHistory", new Error("same cause"))
    })

    const reasons = lines.filter(l => l.includes("same cause"))
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain("3000x")
  })

  it("keeps the last line of a multi-line Prisma error, where the cause is", () => {
    const { lines } = run(r => {
      r.fail("priceHistory", new Error(
        "Invalid `prisma.priceHistory.createMany()` invocation in\n" +
        "/home/runner/work/scripts/fetch-coles.ts:330:31\n\n" +
        "  329 if (history.length > 0) {\n" +
        "→ 330   await prisma.priceHistory.createMany(\n" +
        "The column `id` does not exist in the current database."
      ), 10)
    })

    const reason = lines.find(l => l.includes("10x"))
    expect(reason).toContain("The column `id` does not exist in the current database.")
    expect(reason).not.toContain("fetch-coles.ts")
  })
})
