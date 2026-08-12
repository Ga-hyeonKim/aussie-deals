/**
 * Counting what a scraper actually wrote, so a run that saved nothing cannot
 * report success.
 *
 * Every scraper caught its errors per item and logged them, which is the right
 * shape — one bad product should not abandon the other seven thousand. But the
 * completion line printed `products.length`, the number *attempted*, and the
 * process exited 0 regardless. On 2026-08-12 a Coles run logged
 * "DB 저장 완료: 7,134개" while writing zero price_history rows, and the
 * workflow went green. Nothing in the system could tell total failure from a
 * clean run.
 *
 * So failures are counted rather than only printed, grouped by message (the
 * same Prisma error repeated 7,134 times is one fact, not 7,134), and the
 * process exits non-zero when a category of work collapsed.
 */

/** Work that failed loudly enough to fail the run. See `verdict`. */
const FAIL_RATE = 0.05

type Tally = {
  ok: number
  failed: number
  /** message → how many times, so repeated identical errors collapse. */
  reasons: Map<string, number>
}

const blank = (): Tally => ({ ok: 0, failed: 0, reasons: new Map() })

const messageOf = (e: unknown): string => {
  const raw = e instanceof Error ? e.message : String(e)
  // Prisma errors are multi-line with the offending source inlined; the last
  // non-empty line carries the actual cause ("The column `id` does not exist").
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean)
  return lines[lines.length - 1] ?? raw
}

export function createScrapeReport(label: string) {
  const kinds = new Map<string, Tally>()
  const get = (kind: string) => {
    const t = kinds.get(kind) ?? blank()
    kinds.set(kind, t)
    return t
  }

  /**
   * A kind of work is broken if it saved nothing at all despite being tried,
   * or if more than FAIL_RATE of it failed. Both matter: the first is
   * 2026-08-12, the second is a partial collapse that would otherwise leave a
   * plausible-looking but incomplete week in the archive.
   */
  const verdict = (kind: string, t: Tally): string | null => {
    const attempted = t.ok + t.failed
    if (attempted === 0) return null
    if (t.ok === 0) return `${kind}: saved nothing (${t.failed} attempted)`
    const rate = t.failed / attempted
    if (rate > FAIL_RATE) {
      return `${kind}: ${t.failed}/${attempted} failed (${(rate * 100).toFixed(1)}% > ${FAIL_RATE * 100}%)`
    }
    return null
  }

  return {
    ok(kind: string, n = 1) {
      get(kind).ok += n
    },

    fail(kind: string, e: unknown, n = 1) {
      const t = get(kind)
      t.failed += n
      const msg = messageOf(e)
      t.reasons.set(msg, (t.reasons.get(msg) ?? 0) + n)
    },

    /**
     * Print the tally and set the exit code. Returns true if the run is
     * considered healthy — callers that want to skip follow-up work on a bad
     * run can branch on it.
     */
    finish(): boolean {
      const problems: string[] = []
      console.log(`[${label}] ── scrape report ──`)

      for (const [kind, t] of kinds) {
        const attempted = t.ok + t.failed
        console.log(
          `[${label}] ${kind.padEnd(14)} ${String(attempted).padStart(7)} attempted  ` +
          `${String(t.ok).padStart(7)} ok  ${String(t.failed).padStart(7)} failed`
        )
        // Top 3 causes; identical messages already collapsed into one row.
        const top = [...t.reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        for (const [msg, n] of top) {
          console.log(`[${label}]   ${String(n).padStart(7)}x  ${msg.slice(0, 160)}`)
        }
        const bad = verdict(kind, t)
        if (bad) problems.push(bad)
      }

      if (problems.length === 0) {
        console.log(`[${label}] ── ok ──`)
        return true
      }

      for (const p of problems) console.error(`[${label}] FAILED — ${p}`)
      process.exitCode = 1
      return false
    },
  }
}

export type ScrapeReport = ReturnType<typeof createScrapeReport>
