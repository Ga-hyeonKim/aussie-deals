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

  return NextResponse.json(products)
}
