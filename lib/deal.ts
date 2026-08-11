/**
 * Whether a special is actually cheaper than the regular price.
 *
 * Coles lists things on /on-special that carry no discount at all, so the mere
 * existence of a Product row proves nothing — it has to be checked. Callers
 * pass anything shaped like a deal: full Prisma models, narrowed `select`
 * results, or API response types.
 */
type Deal = {
  salePrice: number
  originalPrice: number | null
}

/** Money in cents, so a displayed price and a compared price never disagree. */
const cents = (n: number) => Math.round(n * 100)

export function isRealDeal<T extends Deal>(
  deal: T | null | undefined
): deal is T & { originalPrice: number } {
  if (!deal || deal.originalPrice === null) return false
  return cents(deal.originalPrice) - cents(deal.salePrice) >= 1
}
