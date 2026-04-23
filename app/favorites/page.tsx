"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useFavorites } from "@/hooks/useFavorites"
import FavoriteButton from "@/components/FavoriteButton"
import type { StoreProductModel } from "@/app/generated/prisma/models"
import type { ProductModel } from "@/app/generated/prisma/models"

type FavoriteWithDeal = {
  id: string
  storeProductId: string
  storeProduct: StoreProductModel
  currentDeal: ProductModel | null
}

export default function FavoritesPage() {
  const { data: session } = useSession()
  const { favorites } = useFavorites()
  const [favList, setFavList] = useState<FavoriteWithDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<StoreProductModel[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!session?.user?.id) {
      setFavList([])
      setLoading(false)
      return
    }

    fetch("/api/favorites")
      .then(res => (res.ok ? res.json() : []))
      .then(setFavList)
      .finally(() => setLoading(false))
  }, [session?.user?.id, favorites])

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(() => {
      setSearching(true)
      fetch(`/api/store-products?q=${encodeURIComponent(query)}`)
        .then(res => (res.ok ? res.json() : []))
        .then(setSearchResults)
        .finally(() => setSearching(false))
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Favorites</h1>
          <p className="mt-1 text-gray-500">Save products you want — we&apos;ll show you when they go on sale.</p>
        </div>

        <div className="mb-6">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search for products to watch ❤️ — save them and wait for the deal!"
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>

        {query.length >= 2 && (
          <div className="mb-8">
            {searching ? (
              <p className="text-sm text-gray-400">Searching...</p>
            ) : searchResults.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {searchResults.map(product => (
                  <div
                    key={product.id}
                    className="flex items-start justify-between gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="text-xs uppercase text-gray-400">{product.store}</p>
                      <p className="truncate text-sm font-semibold leading-tight text-gray-900">{product.name}</p>
                      {product.brand && (
                        <p className="truncate text-xs text-gray-500">{product.brand}</p>
                      )}
                      <p className="mt-1 text-sm font-bold text-gray-900">${product.price.toFixed(2)}</p>
                    </div>
                    <FavoriteButton storeProductId={product.id} productId={product.id} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No products found for &quot;{query}&quot;</p>
            )}
          </div>
        )}

        {!session?.user ? (
          <p className="text-gray-400">Sign in to save favorites across devices.</p>
        ) : loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : favList.length === 0 ? (
          <p className="text-gray-400">No favorites yet — search above and tap ❤️ to start watching.</p>
        ) : (
          <>
            <h2 className="mb-4 text-xl font-bold text-gray-900">Your Watchlist</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {favList.map(fav => (
                <div
                  key={fav.id}
                  className="flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-gray-400">{fav.storeProduct.store}</p>
                      <h2 className="text-sm font-semibold leading-tight text-gray-900">{fav.storeProduct.name}</h2>
                      {fav.storeProduct.brand && (
                        <p className="text-xs text-gray-500">{fav.storeProduct.brand}</p>
                      )}
                    </div>
                    <FavoriteButton storeProductId={fav.storeProductId} productId={fav.storeProductId} />
                  </div>

                  {fav.currentDeal ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                          ON SALE
                        </span>
                        {fav.currentDeal.discountPercent && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                            -{fav.currentDeal.discountPercent}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-end gap-2">
                        <span className="text-lg font-bold text-gray-900">
                          ${fav.currentDeal.salePrice.toFixed(2)}
                        </span>
                        {fav.currentDeal.originalPrice && (
                          <span className="text-sm text-gray-400 line-through">
                            ${fav.currentDeal.originalPrice.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-end gap-2">
                      <span className="text-lg font-bold text-gray-900">
                        ${fav.storeProduct.price.toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-400">Not on sale</span>
                    </div>
                  )}

                  <p className="text-xs text-gray-400">{fav.storeProduct.category}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
