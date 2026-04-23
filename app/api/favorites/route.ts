import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const favorites = await prisma.favorite.findMany({
    where: { userId: session.user.id },
    include: { storeProduct: true },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(favorites)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeProductId } = await request.json()

  const favorite = await prisma.favorite.upsert({
    where: {
      userId_storeProductId: {
        userId: session.user.id,
        storeProductId,
      },
    },
    update: {},
    create: { userId: session.user.id, storeProductId },
    include: { storeProduct: true },
  })

  return NextResponse.json(favorite, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeProductId } = await request.json()

  await prisma.favorite.delete({
    where: {
      userId_storeProductId: {
        userId: session.user.id,
        storeProductId,
      },
    },
  })

  return NextResponse.json({ ok: true })
}
