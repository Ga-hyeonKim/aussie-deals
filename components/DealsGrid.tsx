"use client"

import { useState, useMemo, useEffect } from "react"
import { ProductModel } from "@/app/generated/prisma/models"
import ProductCard from "./ProductCard"
import FilterBar from "./FilterBar"

const DISPLAY_LIMIT = 100

type Props = {
  products: ProductModel[]
}

const STORE_LABELS: Record<string, { label: string; active: string }> = {
  WOOLWORTHS: { label: "Woolworths", active: "bg-green-600 text-white" },
  COLES:      { label: "Coles",      active: "bg-red-600 text-white" },
}

export default function DealsGrid({ products }: Props) {
  const stores = [...new Set(products.map(p => p.store))].sort()
  const [selectedStore, setSelectedStore] = useState<string>(stores[0] ?? "WOOLWORTHS")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const [debouncedQuery, setDebouncedQuery] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const storeProducts = products.filter(p => p.store === selectedStore)
  const categories = [...new Set(storeProducts.map(p => p.category))].sort()

  const filtered = useMemo(() => {
    let result = selectedCategory
      ? storeProducts.filter(p => p.category === selectedCategory)
      : storeProducts

    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) &&
        (p.discountPercent != null || p.originalPrice != null)
      )
    }

    return result
  }, [storeProducts, selectedCategory, debouncedQuery])

  function handleStoreChange(store: string) {
    setSelectedStore(store)
    setSelectedCategory(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* sticky toolbar — sticks below navbar (46px) */}
      <div className="sticky top-[46px] z-30 bg-gray-50 pb-3 flex flex-col gap-3 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.06)]">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search deals..."
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-gray-400 focus:ring-2 focus:ring-green-400"
        />
        {stores.length > 1 && (
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
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
        <FilterBar categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />
      </div>

      <p className="text-sm text-gray-500">{filtered.length} deals</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.slice(0, DISPLAY_LIMIT).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {filtered.length > DISPLAY_LIMIT && (
        <p className="text-center text-sm text-gray-400">
          Showing {DISPLAY_LIMIT} of {filtered.length} deals — search to narrow down
        </p>
      )}
    </div>
  )
}
