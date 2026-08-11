import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isRealDeal } from "@/lib/deal"

type Deal = {
  id: string
  salePrice: number
  originalPrice: number | null
  discountPercent: number | null
  validTo: Date
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  const grouped = request.nextUrl.searchParams.get("grouped") === "1"

  const products = await prisma.storeProduct.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    take: 200,
    orderBy: { name: "asc" },
  })

  if (products.length === 0) return NextResponse.json([])

  // Catalogue rows carry the regular price only, so a product on special would
  // otherwise show its pre-sale price here while the watchlist below shows the
  // discount. Join this week's specials by store+name, same as /api/favorites.
  const now = new Date()
  const currentDeals = await prisma.product.findMany({
    where: {
      validFrom: { lte: now },
      validTo: { gte: now },
      OR: products.map(p => ({ store: p.store, name: p.name })),
    },
    select: {
      id: true,
      store: true,
      name: true,
      salePrice: true,
      originalPrice: true,
      discountPercent: true,
      validTo: true,
    },
  })

  // Only genuine discounts become a "currentDeal" — a listing that reached
  // /on-special without a price cut must fall back to the catalogue price.
  const dealMap = new Map<string, Deal>(
    currentDeals.filter(isRealDeal).map(d => [
      `${d.store}:${d.name}`,
      {
        id: d.id,
        salePrice: d.salePrice,
        originalPrice: d.originalPrice,
        discountPercent: d.discountPercent,
        validTo: d.validTo,
      },
    ])
  )

  const withDeal = products.map(p => ({
    ...p,
    currentDeal: dealMap.get(`${p.store}:${p.name}`) ?? null,
  }))

  if (!grouped) return NextResponse.json(withDeal)

  const seen = new Set<string>()
  const results: (typeof withDeal[number] & { otherStore?: typeof withDeal[number] })[] = []

  for (const p of withDeal) {
    if (p.productGroupId) {
      if (seen.has(p.productGroupId)) continue
      seen.add(p.productGroupId)

      const other = withDeal.find(
        o => o.productGroupId === p.productGroupId && o.id !== p.id
      )
      results.push({ ...p, otherStore: other ?? undefined })
    } else {
      results.push(p)
    }
  }

  return NextResponse.json(results)
}
