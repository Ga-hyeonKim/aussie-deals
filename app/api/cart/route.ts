import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const cartItems = await prisma.cartItem.findMany({
    where: { userId: session.user.id },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(cartItems)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { productId } = await request.json()

  const cartItem = await prisma.cartItem.create({
    data: { userId: session.user.id, productId },
    include: { product: true },
  })

  return NextResponse.json(cartItem, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { productId } = await request.json()

  await prisma.cartItem.delete({
    where: {
      userId_productId: {
        userId: session.user.id,
        productId,
      },
    },
  })

  return NextResponse.json({ ok: true })
}
