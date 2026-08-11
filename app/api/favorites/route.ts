import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isRealDeal } from "@/lib/deal"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const favorites = await prisma.favorite.findMany({
    where: { userId: session.user.id },
    include: {
      storeProduct: {
        include: {
          productGroup: {
            include: { products: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  if (favorites.length === 0) return NextResponse.json([])

  const now = new Date()

  // Build name filters for both the favorited product AND its cross-store counterpart
  const nameFilters: { store: "WOOLWORTHS" | "COLES"; name: string }[] = []
  for (const f of favorites) {
    nameFilters.push({ store: f.storeProduct.store, name: f.storeProduct.name })
    const crossStore = f.storeProduct.productGroup?.products.find(
      p => p.id !== f.storeProduct.id
    )
    if (crossStore) {
      nameFilters.push({ store: crossStore.store, name: crossStore.name })
    }
  }

  const [currentDeals, recentProducts] = await Promise.all([
    prisma.product.findMany({
      where: {
        validFrom: { lte: now },
        validTo: { gte: now },
        OR: nameFilters,
      },
    }),
    prisma.product.findMany({
      where: { OR: nameFilters },
      orderBy: { validTo: "desc" },
      distinct: ["store", "name"],
      select: { store: true, name: true, originalPrice: true, salePrice: true, discountPercent: true, validTo: true },
    }),
  ])

  // Same rule as /api/store-products: no price cut, no deal. See lib/deal.ts.
  const dealMap = new Map(currentDeals.filter(isRealDeal).map(d => [`${d.store}:${d.name}`, d]))
  const recentMap = new Map(recentProducts.map(d => [`${d.store}:${d.name}`, d]))

  return NextResponse.json(
    favorites.map(f => {
      const key = `${f.storeProduct.store}:${f.storeProduct.name}`
      const recent = recentMap.get(key)

      const crossStore = f.storeProduct.productGroup?.products.find(
        p => p.id !== f.storeProduct.id
      ) ?? null
      const crossKey = crossStore ? `${crossStore.store}:${crossStore.name}` : null
      const crossRecent = crossKey ? recentMap.get(crossKey) : null

      return {
        ...f,
        currentDeal: dealMap.get(key) ?? null,
        regularPrice: recent?.originalPrice ?? null,
        crossStore: crossStore ? {
          ...crossStore,
          currentDeal: crossKey ? dealMap.get(crossKey) ?? null : null,
          regularPrice: crossRecent?.originalPrice ?? null,
        } : null,
      }
    })
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
          // only overwrite price if we know the regular (pre-sale) price
          ...(product.originalPrice !== null ? { price: product.originalPrice } : {}),
          imageUrl: product.imageUrl,
        },
        create: {
          store: product.store,
          name: product.name,
          brand: product.brand,
          category: product.category,
          unit: product.unit,
          price: product.originalPrice ?? product.salePrice,
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
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const storeProductId = await resolveStoreProductId(body, true)
    if (!storeProductId) return NextResponse.json({ error: "Product not found" }, { status: 404 })

    await prisma.favorite.create({
      data: { userId: session.user.id, storeProductId },
    }).catch((e: { code?: string }) => {
      if (e.code !== 'P2002') throw e
      // P2002 = already favorited, treat as success
    })

    return NextResponse.json({ storeProductId }, { status: 201 })
  } catch (e) {
    console.error("[favorites POST]", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()

  if (body.all) {
    const { count } = await prisma.favorite.deleteMany({
      where: { userId: session.user.id },
    })
    return NextResponse.json({ ok: true, deleted: count })
  }

  if (body.storeProductIds && Array.isArray(body.storeProductIds)) {
    const { count } = await prisma.favorite.deleteMany({
      where: { userId: session.user.id, storeProductId: { in: body.storeProductIds } },
    })
    return NextResponse.json({ ok: true, deleted: count })
  }

  const storeProductId = await resolveStoreProductId(body, false)
  if (!storeProductId) return NextResponse.json({ ok: true })

  await prisma.favorite.delete({
    where: { userId_storeProductId: { userId: session.user.id, storeProductId } },
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
