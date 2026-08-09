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

  const body = await request.json()

  if (body.all) {
    const { count } = await prisma.cartItem.deleteMany({
      where: { userId: session.user.id },
    })
    return NextResponse.json({ ok: true, deleted: count })
  }

  if (body.productIds && Array.isArray(body.productIds)) {
    const { count } = await prisma.cartItem.deleteMany({
      where: { userId: session.user.id, productId: { in: body.productIds } },
    })
    return NextResponse.json({ ok: true, deleted: count })
  }

  await prisma.cartItem.delete({
    where: {
      userId_productId: {
        userId: session.user.id,
        productId: body.productId,
      },
    },
  })

  return NextResponse.json({ ok: true })
}
