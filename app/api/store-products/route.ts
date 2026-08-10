import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  const grouped = request.nextUrl.searchParams.get("grouped") === "1"

  const products = await prisma.storeProduct.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    take: 200,
    orderBy: { name: "asc" },
  })

  if (!grouped) return NextResponse.json(products)

  const seen = new Map<string, boolean>()
  const results: Array<typeof products[number] & { otherStore?: typeof products[number] }> = []

  for (const p of products) {
    if (p.productGroupId) {
      if (seen.has(p.productGroupId)) continue
      seen.set(p.productGroupId, true)

      const other = products.find(
        o => o.productGroupId === p.productGroupId && o.id !== p.id
      )
      results.push({ ...p, otherStore: other ?? undefined })
    } else {
      results.push(p)
    }
  }

  return NextResponse.json(results)
}
