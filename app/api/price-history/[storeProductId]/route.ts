import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ storeProductId: string }> }) {
  const { storeProductId } = await params

  const history = await prisma.priceHistory.findMany({
    where: { storeProductId },
    orderBy: { recordedAt: "asc" },
    take: 52, // max ~1 year of weekly data
  })

  return NextResponse.json(history)
}
