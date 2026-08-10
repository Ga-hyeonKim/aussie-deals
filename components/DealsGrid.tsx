"use client"

import { useState, useMemo, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ProductModel } from "@/app/generated/prisma/models"
import ProductCard from "./ProductCard"
import FilterBar from "./FilterBar"

const PAGE_SIZE = 48

const STORE_LABELS: Record<string, { label: string; active: string }> = {
  WOOLWORTHS: { label: "Woolworths", active: "bg-green-600 text-white" },
  COLES:      { label: "Coles",      active: "bg-red-600 text-white" },
}

const DISCOUNT_FILTERS: { label: string; value: number | null }[] = [
  { label: "All", value: null },
  { label: "Half price", value: 50 },
  { label: "30%+", value: 30 },
  { label: "20%+", value: 20 },
]

type Props = {
  products: ProductModel[]
}

export default function DealsGrid({ products }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const stores = [...new Set(products.map(p => p.store))].sort()

  const selectedStore = (searchParams.get("store")?.toUpperCase() ?? stores[0] ?? "WOOLWORTHS")
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1)
  const displayCount = page * PAGE_SIZE
  const selectedCategory = searchParams.get("category") ?? null
  const discountParam = searchParams.get("discount")
  const discountFilter = discountParam ? parseInt(discountParam) : null

  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : "/", { scroll: false })
  }

  function handleStoreChange(store: string) {
    updateParams({ store: store.toLowerCase(), category: null, page: null, discount: null })
  }

  function handleCategoryChange(category: string | null) {
    updateParams({ category, page: null })
  }

  function handleDiscountChange(value: number | null) {
    updateParams({ discount: value?.toString() ?? null, page: null })
  }

  function handleLoadMore() {
    updateParams({ page: String(page + 1) })
  }

  const storeProducts = products.filter(p => p.store === selectedStore)
  const categories = [...new Set(storeProducts.map(p => p.category))].sort()

  const filtered = useMemo(() => {
    let result = selectedCategory
      ? storeProducts.filter(p => p.category === selectedCategory)
      : storeProducts

    if (discountFilter !== null) {
      result = result.filter(p => p.discountPercent != null && p.discountPercent >= discountFilter)
    }

    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase()
      result = result.filter(p => p.name.toLowerCase().includes(q))
    }

    return result
  }, [storeProducts, selectedCategory, discountFilter, debouncedQuery])

  const visible = filtered.slice(0, displayCount)
  const hasMore = filtered.length > displayCount

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-[46px] z-30 bg-gray-50 pb-3 flex flex-col gap-3 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.06)]">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search deals..."
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-gray-400 focus:ring-2 focus:ring-green-400"
        />
        <div className="flex flex-wrap gap-2 items-center">
          {stores.length > 1 && (
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {stores.map(store => (
                <button
                  key={store}
                  onClick={() => handleStoreChange(store)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                    selectedStore === store
                      ? (STORE_LABELS[store]?.active ?? "bg-gray-900 text-white")
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {STORE_LABELS[store]?.label ?? store}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {DISCOUNT_FILTERS.map(f => (
              <button
                key={f.label}
                onClick={() => handleDiscountChange(f.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  discountFilter === f.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <FilterBar categories={categories} selected={selectedCategory} onSelect={handleCategoryChange} />
      </div>

      <p className="text-sm text-gray-500">
        {hasMore ? `Showing ${displayCount} of ${filtered.length} deals` : `${filtered.length} deals`}
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {hasMore && (
        <button
          onClick={handleLoadMore}
          className="mx-auto rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          Load more ({filtered.length - displayCount} remaining)
        </button>
      )}
    </div>
  )
}
