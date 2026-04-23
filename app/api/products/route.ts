import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get("category")
  const ids = searchParams.get("ids")

  const now = new Date()

  const products = await prisma.product.findMany({
    where: {
      ...(ids
        ? { id: { in: ids.split(",") } }
        : {
            validFrom: { lte: now },
            validTo: { gte: now },
            ...(category ? { category } : {}),
          }),
    },
    orderBy: { discountPercent: "desc" },
  })

  const storeProducts = await prisma.storeProduct.findMany({
    where: {
      OR: products.map(p => ({ store: p.store, name: p.name })),
    },
    select: { id: true, store: true, name: true },
  })

  const spMap = new Map(
    storeProducts.map(sp => [`${sp.store}:${sp.name}`, sp.id])
  )

  const result = products.map(p => ({
    ...p,
    storeProductId: spMap.get(`${p.store}:${p.name}`) ?? null,
  }))

  return NextResponse.json(result)
}
