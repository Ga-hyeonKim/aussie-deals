import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const favorites = await prisma.favorite.findMany({
    where: { userId: session.user.id },
    include: { storeProduct: true },
    orderBy: { createdAt: "desc" },
  })

  if (favorites.length === 0) return NextResponse.json([])

  const now = new Date()
  const nameFilters = favorites.map(f => ({ store: f.storeProduct.store, name: f.storeProduct.name }))

  const currentDeals = await prisma.product.findMany({
    where: {
      validFrom: { lte: now },
      validTo: { gte: now },
      OR: nameFilters,
    },
  })

  const dealMap = new Map(currentDeals.map(d => [`${d.store}:${d.name}`, d]))

  return NextResponse.json(
    favorites.map(f => ({
      ...f,
      currentDeal: dealMap.get(`${f.storeProduct.store}:${f.storeProduct.name}`) ?? null,
    }))
  )
}

async function resolveStoreProductId(
  body: { storeProductId?: string; productId?: string },
  upsertIfMissing = true
): Promise<string | null> {
  if (body.storeProductId) return body.storeProductId

  if (body.productId) {
    const product = await prisma.product.findUnique({ where: { id: body.productId } })
    if (!product) return null

    if (upsertIfMissing) {
      const sp = await prisma.storeProduct.upsert({
        where: { store_name: { store: product.store, name: product.name } },
        update: {
          brand: product.brand,
          category: product.category,
          unit: product.unit,
          price: product.salePrice,
          imageUrl: product.imageUrl,
        },
        create: {
          store: product.store,
          name: product.name,
          brand: product.brand,
          category: product.category,
          unit: product.unit,
          price: product.salePrice,
          imageUrl: product.imageUrl,
        },
      })
      return sp.id
    } else {
      const sp = await prisma.storeProduct.findUnique({
        where: { store_name: { store: product.store, name: product.name } },
      })
      return sp?.id ?? null
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const storeProductId = await resolveStoreProductId(body, true)
  if (!storeProductId) return NextResponse.json({ error: "Product not found" }, { status: 404 })

  const favorite = await prisma.favorite.upsert({
    where: { userId_storeProductId: { userId: session.user.id, storeProductId } },
    update: {},
    create: { userId: session.user.id, storeProductId },
    include: { storeProduct: true },
  })

  return NextResponse.json({ ...favorite, storeProductId }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const storeProductId = await resolveStoreProductId(body, false)
  if (!storeProductId) return NextResponse.json({ ok: true })

  await prisma.favorite.delete({
    where: { userId_storeProductId: { userId: session.user.id, storeProductId } },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
