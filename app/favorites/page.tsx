"use client"

import { useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useFavorites } from "@/hooks/useFavorites"
import Image from "next/image"
import Link from "next/link"
import FavoriteButton from "@/components/FavoriteButton"
import type { StoreProductModel } from "@/app/generated/prisma/models"
import type { ProductModel } from "@/app/generated/prisma/models"

type CrossStoreInfo = {
  store: string
  name: string
  price: number
  imageUrl: string | null
  currentDeal: ProductModel | null
  regularPrice: number | null
}

type FavoriteWithDeal = {
  id: string
  storeProductId: string
  storeProduct: StoreProductModel
  currentDeal: ProductModel | null
  regularPrice: number | null
  crossStore: CrossStoreInfo | null
}

export default function FavoritesPage() {
  const { data: session } = useSession()
  const { favorites, isFavorited } = useFavorites()
  const [favList, setFavList] = useState<FavoriteWithDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<StoreProductModel[]>([])
  const [searching, setSearching] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const watchlistRef = useRef<HTMLHeadingElement>(null)

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
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Favorites</h1>
            <p className="mt-1 text-gray-500">Save products you want — we&apos;ll show you when they go on sale.</p>
          </div>
          {favList.length > 0 && (
            <button
              onClick={() => { setSelectMode(!selectMode); setSelected(new Set()) }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-green-600 hover:bg-green-50 transition-colors"
            >
              {selectMode ? "Done" : "Edit"}
            </button>
          )}
        </div>

        <div className="mb-2 flex gap-2">
          <div className="relative flex-1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search products to watch..."
              className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 py-2.5 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
          <button className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors shrink-0">
            Search
          </button>
        </div>
        <p className="mb-6 text-xs text-gray-400">Save products you love — we&apos;ll let you know when they go on sale. ❤️</p>

        {query.length >= 2 && (
          <div className="mb-8">
            {searching ? (
              <p className="text-sm text-gray-400">Searching...</p>
            ) : searchResults.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {searchResults.map(product => {
                  const watching = isFavorited(product.id)
                  return (
                    <div
                      key={product.id}
                      className={`flex flex-col gap-2 rounded-2xl border p-3 shadow-sm transition-colors ${watching ? "border-green-400 bg-green-50" : "border-gray-200 bg-white"}`}
                    >
                      {watching && (
                        <span className="self-start rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">WATCHING</span>
                      )}
                      {product.imageUrl && (
                        <div className="relative mx-auto h-24 w-24">
                          <Image src={product.imageUrl} alt={product.name} fill sizes="96px" unoptimized className="object-contain" />
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs uppercase text-gray-400">{product.store}</p>
                          <p className="truncate text-sm font-semibold leading-tight text-gray-900">{product.name}</p>
                          {product.brand && (
                            <p className="truncate text-xs text-gray-500">{product.brand}</p>
                          )}
                          <p className="mt-1 text-sm font-bold text-gray-900">${product.price.toFixed(2)}</p>
                        </div>
                        <FavoriteButton storeProductId={product.id} productId={product.id} onToggle={() => {
                          watchlistRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No products found for &quot;{query}&quot;</p>
            )}
          </div>
        )}

        {!session?.user ? (
          <p className="text-gray-400">
            <Link href="/login" className="text-green-600 underline">Sign in</Link> to save and view your favorites.
          </p>
        ) : loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : favList.length === 0 ? (
          <p className="text-gray-400">No favorites yet — search above and tap ❤️ to start watching.</p>
        ) : (
          <>
            <h2 ref={watchlistRef} className="mb-4 text-xl font-bold text-gray-900">Your Watchlist</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {favList.map(fav => (
                <div
                  key={fav.id}
                  className={`relative flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm transition-colors ${selectMode && selected.has(fav.storeProductId) ? "border-green-400 bg-green-50" : "border-gray-200"}`}
                  onClick={selectMode ? () => {
                    setSelected(prev => {
                      const next = new Set(prev)
                      if (next.has(fav.storeProductId)) next.delete(fav.storeProductId)
                      else next.add(fav.storeProductId)
                      return next
                    })
                  } : undefined}
                >
                  {!selectMode && <Link href={`/store-product/${fav.storeProductId}`} className="absolute inset-0 z-0 rounded-2xl" aria-label={fav.storeProduct.name} />}
                  {selectMode && (
                    <div className={`absolute top-3 left-3 z-10 flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${selected.has(fav.storeProductId) ? "border-green-600 bg-green-600" : "border-gray-300 bg-white"}`}>
                      {selected.has(fav.storeProductId) && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  )}
                  {fav.storeProduct.imageUrl && (
                    <div className="relative mx-auto h-28 w-28">
                      <Image src={fav.storeProduct.imageUrl} alt={fav.storeProduct.name} fill sizes="112px" unoptimized className="object-contain" />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-gray-400">{fav.storeProduct.store}</p>
                      <h2 className="truncate text-sm font-semibold leading-tight text-gray-900">{fav.storeProduct.name}</h2>
                      {fav.storeProduct.brand && (
                        <p className="truncate text-xs text-gray-500">{fav.storeProduct.brand}</p>
                      )}
                    </div>
                    {!selectMode && (
                      <div className="relative z-10 shrink-0">
                        <FavoriteButton storeProductId={fav.storeProductId} productId={fav.storeProductId} />
                      </div>
                    )}
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
                        ${(fav.regularPrice ?? fav.storeProduct.price).toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-400">Not on sale</span>
                    </div>
                  )}

                  {fav.crossStore && (
                    <div className="mt-1 rounded-lg bg-gray-50 px-2.5 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{fav.crossStore.store}</p>
                      {fav.crossStore.currentDeal ? (
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">SALE</span>
                          <span className="text-sm font-bold text-gray-900">${fav.crossStore.currentDeal.salePrice.toFixed(2)}</span>
                          {fav.crossStore.currentDeal.originalPrice && (
                            <span className="text-xs text-gray-400 line-through">${fav.crossStore.currentDeal.originalPrice.toFixed(2)}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-gray-600">
                          ${(fav.crossStore.regularPrice ?? fav.crossStore.price).toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-gray-400">{fav.storeProduct.category}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {selectMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white px-4 py-3 safe-bottom">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <button
              onClick={() => setSelected(new Set(favList.map(f => f.storeProductId)))}
              className="text-sm font-medium text-green-600"
            >
              Select All
            </button>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const ids = [...selected]
                  if (ids.length === 0) return
                  setFavList(prev => prev.filter(f => !selected.has(f.storeProductId)))
                  setSelected(new Set())
                  setSelectMode(false)
                  await fetch("/api/favorites", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ storeProductIds: ids }),
                  })
                }}
                disabled={selected.size === 0}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
              >
                Delete{selected.size > 0 ? ` (${selected.size})` : ""}
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Clear all favorites?")) return
                  setFavList([])
                  setSelected(new Set())
                  setSelectMode(false)
                  await fetch("/api/favorites", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ all: true }),
                  })
                }}
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
