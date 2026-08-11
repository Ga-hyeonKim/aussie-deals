/**
 * Pack size parsing, for deciding whether two store listings are the same
 * product.
 *
 * Cross-store matching runs on `canonicalBrand` plus an embedding of
 * `normalizedName` — and `normalizedName` strips the size, so the embedding
 * cannot tell a 226g tub from a 473mL bottle. Both normalise to
 * "daily advance lotion". Size has to be checked separately.
 */

/**
 * A size reduced to a comparable key: measure kind, amount per item, and how
 * many items. `1L` and `1000mL` produce the same key; `375mL x 10 pack` and
 * `3.75L` do not, which is intended — a ten-pack of cans is not a big bottle.
 */
export type Size = string

const FACTOR: Record<string, { kind: "v" | "m"; mul: number }> = {
  ml: { kind: "v", mul: 1 },
  l: { kind: "v", mul: 1000 },
  litre: { kind: "v", mul: 1000 },
  litres: { kind: "v", mul: 1000 },
  mg: { kind: "m", mul: 0.001 },
  g: { kind: "m", mul: 1 },
  kg: { kind: "m", mul: 1000 },
}

const MEASURE = "ml|litres|litre|l|kg|mg|g"

// "375mL x 10 pack", "580mL 4 pack" — a per-item measure and a pack count
const MEASURE_THEN_PACK = new RegExp(`^(\\d+(?:\\.\\d+)?)(${MEASURE})(?:x|\\s)*(\\d+)(?:pack|pk)$`)
// "2x100g" — a count and a per-item measure
const COUNT_THEN_MEASURE = new RegExp(`^(\\d+)x(\\d+(?:\\.\\d+)?)(${MEASURE})$`)
// "473mL", "1kg"
const MEASURE_ONLY = new RegExp(`^(\\d+(?:\\.\\d+)?)(${MEASURE})$`)
// "6 pack", "12pk" — a count with no measure at all
const COUNT_ONLY = /^(\d+)(?:pack|pk|pce|pcs|piece|pieces)$/

function key(kind: string, each: number, count: number): Size {
  // Round to kill float noise from mg conversions (0.001 * 500 = 0.5)
  return `${kind}:${Math.round(each * 1000) / 1000}x${count}`
}

/**
 * Parse a store's `unit` string into a comparable key.
 *
 * Returns null when there is no size claim to compare — "each", an empty
 * string, or a format not seen before. Null means "no opinion", never
 * "mismatch": refusing to match on an unrecognised format would throw away
 * good pairs for no gain.
 */
export function parseSize(raw: string | null | undefined): Size | null {
  if (!raw) return null
  const s = raw.toLowerCase().trim().replace(/\s+/g, "").replace(/×/g, "x")
  if (!s) return null

  const mp = MEASURE_THEN_PACK.exec(s)
  if (mp) {
    const f = FACTOR[mp[2]]
    return f ? key(f.kind, Number(mp[1]) * f.mul, Number(mp[3])) : null
  }

  const cm = COUNT_THEN_MEASURE.exec(s)
  if (cm) {
    const f = FACTOR[cm[3]]
    return f ? key(f.kind, Number(cm[2]) * f.mul, Number(cm[1])) : null
  }

  const mo = MEASURE_ONLY.exec(s)
  if (mo) {
    const f = FACTOR[mo[2]]
    return f ? key(f.kind, Number(mo[1]) * f.mul, 1) : null
  }

  const co = COUNT_ONLY.exec(s)
  if (co) return key("c", Number(co[1]), 1)

  return null
}

/**
 * Do two `unit` strings describe the same pack?
 *
 * `true` — same size, safe to match.
 * `false` — different sizes, must not be matched.
 * `null` — at least one side makes no size claim, so this test abstains.
 */
export function sameSize(a: string | null | undefined, b: string | null | undefined): boolean | null {
  const pa = parseSize(a)
  const pb = parseSize(b)
  if (pa === null || pb === null) return null
  return pa === pb
}
