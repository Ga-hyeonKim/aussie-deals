import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  const products = await prisma.storeProduct.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    take: 20,
    orderBy: { name: "asc" },
  })

  return NextResponse.json(products)
}
