"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useFavorites } from "@/hooks/useFavorites"
import FavoriteButton from "@/components/FavoriteButton"
import type { StoreProductModel } from "@/app/generated/prisma/models"

export default function FavoritesPage() {
  const { data: session } = useSession()
  const { favorites } = useFavorites()
  const [products, setProducts] = useState<StoreProductModel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.user?.id) {
      setProducts([])
      setLoading(false)
      return
    }

    fetch("/api/favorites")
      .then(res => {
        if (!res.ok) return []
        return res.json()
      })
      .then(data => {
        setProducts(data.map((f: { storeProduct: StoreProductModel }) => f.storeProduct))
      })
      .finally(() => setLoading(false))
  }, [session?.user?.id, favorites])

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Favorites</h1>
          <p className="mt-1 text-gray-500">Items you&apos;re watching for deals</p>
        </div>

        {!session?.user ? (
          <p className="text-gray-400">Sign in to save favorites across devices.</p>
        ) : loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : products.length === 0 ? (
          <p className="text-gray-400">No favorites yet. Search for items and tap ❤️ to watch them.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map(product => (
              <div
                key={product.id}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">{product.store}</p>
                    <h2 className="text-sm font-semibold text-gray-900 leading-tight">{product.name}</h2>
                    {product.brand && (
                      <p className="text-xs text-gray-500">{product.brand}</p>
                    )}
                  </div>
                  <FavoriteButton storeProductId={product.id} />
                </div>

                <div className="flex items-end gap-2">
                  <span className="text-lg font-bold text-gray-900">
                    ${product.price.toFixed(2)}
                  </span>
                  {product.unit && (
                    <span className="text-xs text-gray-400">{product.unit}</span>
                  )}
                </div>

                <p className="text-xs text-gray-400">{product.category}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
