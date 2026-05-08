"use client"

import { useState, useMemo, useEffect, useRef } from "react"
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
  const stores = [...new Set(products.map(p => p.store))].sort()
  const [selectedStore, setSelectedStore] = useState<string>(stores[0] ?? "WOOLWORTHS")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [discountFilter, setDiscountFilter] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE)
  const scrollRestoreRef = useRef<number | null>(null)
  const isFirstRender = useRef(true)
  const isFirstDisplayCountEffect = useRef(true)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset on filter changes — skip initial mount so restore effect can read sessionStorage first
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setDisplayCount(PAGE_SIZE)
    sessionStorage.removeItem('dealsDisplayCount')
    sessionStorage.removeItem('dealsScrollY')
  }, [selectedStore, selectedCategory, discountFilter, debouncedQuery])

  // Restore scroll + displayCount when returning from a product page
  useEffect(() => {
    if (!sessionStorage.getItem('dealsReturning')) return
    sessionStorage.removeItem('dealsReturning')

    const savedCount = parseInt(sessionStorage.getItem('dealsDisplayCount') ?? '')
    const savedScroll = parseInt(sessionStorage.getItem('dealsScrollY') ?? '0')

    if (!isNaN(savedCount) && savedCount > PAGE_SIZE) {
      scrollRestoreRef.current = savedScroll
      setDisplayCount(savedCount)
    } else {
      setTimeout(() => window.scrollTo({ top: savedScroll, behavior: 'instant' }), 100)
    }
  }, [])

  // Scroll to saved position AFTER displayCount re-render (skip mount, only run on change)
  useEffect(() => {
    if (isFirstDisplayCountEffect.current) {
      isFirstDisplayCountEffect.current = false
      return
    }
    if (scrollRestoreRef.current === null) return
    const y = scrollRestoreRef.current
    scrollRestoreRef.current = null
    setTimeout(() => window.scrollTo({ top: y, behavior: 'instant' }), 100)
  }, [displayCount])

  // Persist displayCount whenever it changes
  useEffect(() => {
    sessionStorage.setItem('dealsDisplayCount', String(displayCount))
  }, [displayCount])

  // Persist scroll position continuously
  useEffect(() => {
    const onScroll = () => sessionStorage.setItem('dealsScrollY', String(Math.round(window.scrollY)))
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Set returning flag on unmount — more reliable than onClick bubbling
  useEffect(() => {
    return () => { sessionStorage.setItem('dealsReturning', 'true') }
  }, [])

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
                onClick={() => setDiscountFilter(f.value)}
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
        <FilterBar categories={categories} selected={selectedCategory} onSelect={setSelectedCategory} />
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
          onClick={() => setDisplayCount(c => c + PAGE_SIZE)}
          className="mx-auto rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          Load more ({filtered.length - displayCount} remaining)
        </button>
      )}
    </div>
  )
}
