import { prisma } from "@/lib/prisma"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import FavoriteButton from "@/components/FavoriteButton"
import CartButton from "@/components/CartButton"
import BackButton from "@/components/BackButton"
import CrossStorePriceChart from "@/components/CrossStorePriceChart"

const STORE_STYLE: Record<string, { label: string; chip: string; ring: string }> = {
  WOOLWORTHS: { label: "Woolworths", chip: "bg-green-100 text-green-800", ring: "border-green-200" },
  COLES:      { label: "Coles",      chip: "bg-red-100 text-red-700",    ring: "border-red-200" },
}

export default async function ProductGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const group = await prisma.productGroup.findUnique({
    where: { id },
    include: { products: { orderBy: { store: "asc" } } },
  })
  if (!group || group.products.length === 0) notFound()

  const now = new Date()

  const entries = await Promise.all(
    group.products.map(async sp => {
      const [currentDeal, recentProduct] = await Promise.all([
        prisma.product.findFirst({
          where: {
            store: sp.store,
            name: sp.name,
            validFrom: { lte: now },
            validTo: { gte: now },
          },
        }),
        prisma.product.findFirst({
          where: { store: sp.store, name: sp.name },
          orderBy: { validTo: "desc" },
          select: { originalPrice: true },
        }),
      ])

      const regularPrice = recentProduct?.originalPrice ?? sp.price
      const effectivePrice = currentDeal?.salePrice ?? regularPrice

      return { sp, currentDeal, regularPrice, effectivePrice }
    })
  )

  const cheapest = Math.min(...entries.map(e => e.effectivePrice))
  const spread = Math.max(...entries.map(e => e.effectivePrice)) - cheapest

  const primary = entries[0].sp
  const displayName = entries.reduce((a, b) => (a.sp.name.length <= b.sp.name.length ? a : b)).sp.name
  const heroImage = entries.find(e => e.sp.imageUrl)?.sp.imageUrl

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-4 py-6">
        <BackButton />

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {heroImage && (
            <div className="relative mx-auto mb-6 h-48 w-48">
              <Image src={heroImage} alt={displayName} fill sizes="192px" unoptimized className="object-contain" />
            </div>
          )}

          <div className="mb-1 flex items-center gap-1.5">
            {entries.map(e => (
              <span
                key={e.sp.id}
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${STORE_STYLE[e.sp.store]?.chip ?? "bg-gray-100 text-gray-600"}`}
              >
                {STORE_STYLE[e.sp.store]?.label ?? e.sp.store}
              </span>
            ))}
          </div>

          <h1 className="mb-1 text-xl font-bold leading-snug text-gray-900">{displayName}</h1>
          {primary.brand && <p className="mb-4 text-sm text-gray-500">{primary.brand}</p>}

          {spread > 0 && (
            <p className="mb-4 text-sm font-medium text-gray-700">
              Save <span className="font-bold text-gray-900">${spread.toFixed(2)}</span> by buying at the cheaper store
            </p>
          )}

          <div className="space-y-2">
            {entries.map(({ sp, currentDeal, regularPrice, effectivePrice }) => {
              const isCheapest = effectivePrice === cheapest && spread > 0
              return (
                <div
                  key={sp.id}
                  className={`rounded-xl border p-3 ${isCheapest ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white"}`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${STORE_STYLE[sp.store]?.chip ?? "bg-gray-100 text-gray-600"}`}>
                      {STORE_STYLE[sp.store]?.label ?? sp.store}
                    </span>
                    {isCheapest && (
                      <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">CHEAPEST</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-900">${effectivePrice.toFixed(2)}</span>
                    {currentDeal && currentDeal.originalPrice && (
                      <span className="text-sm text-gray-400 line-through">${currentDeal.originalPrice.toFixed(2)}</span>
                    )}
                    {currentDeal && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                        ON SALE{currentDeal.discountPercent ? ` -${currentDeal.discountPercent}%` : ""}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 truncate text-xs text-gray-500">{sp.name}</p>
                  {sp.unit && <p className="text-xs text-gray-400">Size: {sp.unit}</p>}
                  {!currentDeal && regularPrice !== sp.price && (
                    <p className="text-xs text-gray-400">Catalogue price ${sp.price.toFixed(2)}</p>
                  )}

                  <div className="mt-2 flex items-center gap-3">
                    {currentDeal && <CartButton productId={currentDeal.id} />}
                    <Link href={`/store-product/${sp.id}`} className="text-xs font-medium text-gray-500 underline hover:text-gray-700">
                      View {STORE_STYLE[sp.store]?.label ?? sp.store} page
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <FavoriteButton storeProductId={primary.id} productId={primary.id} />
            <span className="text-xs text-gray-400">Watch this product across both stores</span>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="mb-3 text-sm font-semibold text-gray-700">Price History — both stores</p>
            <CrossStorePriceChart stores={entries.map(e => ({ storeProductId: e.sp.id, store: e.sp.store }))} />
          </div>

          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Notify me when on sale</p>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-600">Coming soon</span>
            </div>
            <p className="text-xs text-gray-400">
              Get a push notification the moment this product goes on special at either store.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
