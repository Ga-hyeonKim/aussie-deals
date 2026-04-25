import { prisma } from "@/lib/prisma"
import Image from "next/image"
import { notFound } from "next/navigation"
import FavoriteButton from "@/components/FavoriteButton"
import CartButton from "@/components/CartButton"
import BackButton from "@/components/BackButton"

export default async function StoreProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const storeProduct = await prisma.storeProduct.findUnique({ where: { id } })
  if (!storeProduct) notFound()

  const now = new Date()
  const currentDeal = await prisma.product.findFirst({
    where: {
      store: storeProduct.store,
      name: storeProduct.name,
      validFrom: { lte: now },
      validTo: { gte: now },
    },
  })

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-4 py-6">
        <BackButton />

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {storeProduct.imageUrl && (
            <div className="relative mx-auto mb-6 h-48 w-48">
              <Image
                src={storeProduct.imageUrl}
                alt={storeProduct.name}
                fill
                sizes="192px"
                className="object-contain"
              />
            </div>
          )}

          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
            {storeProduct.store}
          </div>

          <h1 className="mb-1 text-xl font-bold text-gray-900 leading-snug">{storeProduct.name}</h1>

          {storeProduct.brand && (
            <p className="mb-4 text-sm text-gray-500">{storeProduct.brand}</p>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {currentDeal ? (
              <>
                <span className="text-3xl font-bold text-gray-900">${currentDeal.salePrice.toFixed(2)}</span>
                {currentDeal.originalPrice && (
                  <span className="text-lg text-gray-400 line-through">${currentDeal.originalPrice.toFixed(2)}</span>
                )}
                <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">ON SALE</span>
                {currentDeal.discountPercent && (
                  <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">
                    -{currentDeal.discountPercent}%
                  </span>
                )}
              </>
            ) : (
              <span className="text-3xl font-bold text-gray-900">${storeProduct.price.toFixed(2)}</span>
            )}
          </div>

          <div className="mb-6 space-y-1 text-sm text-gray-500">
            {storeProduct.unit && <p>Size: {storeProduct.unit}</p>}
            <p>Category: {storeProduct.category}</p>
            {currentDeal && (
              <p>On sale until {new Date(currentDeal.validTo).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <FavoriteButton storeProductId={storeProduct.id} productId={storeProduct.id} />
            {currentDeal && <CartButton productId={currentDeal.id} />}
          </div>
        </div>

        {/* Coming soon */}
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Price History</p>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-600">Coming soon</span>
            </div>
            <div className="flex h-16 items-end gap-1">
              {[60, 45, 60, 60, 40, 55, 35].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-gray-100" style={{ height: `${h}%` }} />
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">Track how this price changes week to week.</p>
          </div>

          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Is this a real deal?</p>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-600">Coming soon</span>
            </div>
            <p className="text-xs text-gray-400">
              We&apos;ll compare this sale price against the historical average — so you know if it&apos;s actually worth grabbing.
            </p>
          </div>

          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Notify me when on sale</p>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-600">Coming soon</span>
            </div>
            <p className="text-xs text-gray-400">
              Get a push notification the moment this product goes on special.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
