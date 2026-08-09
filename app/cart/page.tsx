"use client"

import { useEffect, useState, useRef } from "react"
import { useSession } from "next-auth/react"
import { useCart } from "@/hooks/useCart"
import Link from "next/link"
import Image from "next/image"
import type { ProductModel } from "@/app/generated/prisma/models"

type CartItemWithProduct = {
  id: string
  productId: string
  createdAt: string
  product: ProductModel
}

const STORE_LABELS: Record<string, { label: string; active: string }> = {
  WOOLWORTHS: { label: "Woolworths", active: "bg-green-600 text-white" },
  COLES:      { label: "Coles",      active: "bg-red-600 text-white" },
}

export default function CartPage() {
  const { data: session } = useSession()
  const { toggle } = useCart()
  const [items, setItems] = useState<CartItemWithProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState<string | null>(null)
  const [undoItem, setUndoItem] = useState<CartItemWithProduct | null>(null)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!session?.user) {
      setLoading(false)
      return
    }
    fetch("/api/cart")
      .then((res) => res.json())
      .then((data: CartItemWithProduct[]) => {
        setItems(data)
        const stores = [...new Set(data.map(i => i.product.store))].sort()
        if (stores.length > 0) setSelectedStore(stores[0])
      })
      .finally(() => setLoading(false))
  }, [session?.user])

  if (!session?.user) {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-6xl px-4 py-10 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Cart</h1>
          <p className="mt-4 text-gray-500">
            <Link href="/login" className="text-green-600 underline">Sign in</Link> to use your cart.
          </p>
        </div>
      </main>
    )
  }

  const now = new Date()
  const stores = [...new Set(items.map(i => i.product.store))].sort()
  const storeItems = selectedStore ? items.filter(i => i.product.store === selectedStore) : items
  const activeItems = storeItems.filter((i) => new Date(i.product.validTo) >= now)
  const expiredItems = storeItems.filter((i) => new Date(i.product.validTo) < now)
  const activeTotal = activeItems.reduce((sum, i) => sum + i.product.salePrice, 0)
  const totalActiveCount = items.filter((i) => new Date(i.product.validTo) >= now).length

  function handleRemove(productId: string) {
    const item = items.find((i) => i.productId === productId)
    if (!item) return

    setItems((prev) => prev.filter((i) => i.productId !== productId))
    toggle(productId)

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    setUndoItem(item)
    undoTimeoutRef.current = setTimeout(() => setUndoItem(null), 3000)
  }

  function handleUndo() {
    if (!undoItem) return
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    setItems((prev) => [undoItem, ...prev])
    toggle(undoItem.productId)
    setUndoItem(null)
  }

  function toggleSelect(productId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(storeItems.map(i => i.productId)))
  }

  async function deleteSelected() {
    const ids = [...selected]
    if (ids.length === 0) return
    setItems(prev => prev.filter(i => !selected.has(i.productId)))
    ids.forEach(id => toggle(id))
    setSelected(new Set())
    setSelectMode(false)
    await fetch("/api/cart", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: ids }),
    })
  }

  async function clearAll() {
    if (!confirm("Clear all cart items?")) return
    setItems([])
    setSelected(new Set())
    setSelectMode(false)
    await fetch("/api/cart", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cart</h1>
            <p className="mt-1 text-gray-500">
              {items.length === 0 && !loading
                ? "Your cart is empty"
                : `${totalActiveCount} item${totalActiveCount !== 1 ? "s" : ""} on sale`}
            </p>
          </div>
          {items.length > 0 && (
            <button
              onClick={() => { setSelectMode(!selectMode); setSelected(new Set()) }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-green-600 hover:bg-green-50 transition-colors"
            >
              {selectMode ? "Done" : "Edit"}
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-gray-400">
            Browse <Link href="/" className="text-green-600 underline">this week&apos;s deals</Link> and add items to your cart.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {stores.length > 1 && (
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                {stores.map(store => (
                  <button
                    key={store}
                    onClick={() => setSelectedStore(store)}
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

            {activeItems.length > 0 && (
              <div className="flex flex-col gap-3">
                {activeItems.map((item) => (
                  <CartRow key={item.id} item={item} expired={false} onRemove={handleRemove} selectMode={selectMode} selected={selected.has(item.productId)} onToggleSelect={toggleSelect} />
                ))}
                <div className="flex justify-between border-t border-gray-200 pt-4 mt-2">
                  <span className="font-semibold text-gray-900">Estimated total</span>
                  <span className="font-bold text-gray-900">${activeTotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            {activeItems.length === 0 && expiredItems.length === 0 && (
              <p className="text-gray-400 text-sm">No items from this store.</p>
            )}

            {expiredItems.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-gray-400 mb-3">Sale ended</h2>
                <div className="flex flex-col gap-3 opacity-60">
                  {expiredItems.map((item) => (
                    <CartRow key={item.id} item={item} expired={true} onRemove={handleRemove} selectMode={selectMode} selected={selected.has(item.productId)} onToggleSelect={toggleSelect} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {undoItem && !selectMode && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-2xl bg-gray-900 px-5 py-3 text-sm text-white shadow-xl">
          <span className="max-w-[160px] truncate">{undoItem.product.name} removed</span>
          <button
            onClick={handleUndo}
            className="shrink-0 font-bold text-green-400 hover:text-green-300 transition-colors"
          >
            Undo
          </button>
        </div>
      )}

      {selectMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white px-4 py-3 safe-bottom">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <button onClick={selectAll} className="text-sm font-medium text-green-600">
              Select All
            </button>
            <div className="flex gap-2">
              <button
                onClick={deleteSelected}
                disabled={selected.size === 0}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
              >
                Delete{selected.size > 0 ? ` (${selected.size})` : ""}
              </button>
              <button
                onClick={clearAll}
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

function CartRow({
  item,
  expired,
  onRemove,
  selectMode,
  selected,
  onToggleSelect,
}: {
  item: CartItemWithProduct
  expired: boolean
  onRemove: (productId: string) => void
  selectMode: boolean
  selected: boolean
  onToggleSelect: (productId: string) => void
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border bg-white p-3 transition-colors ${selected ? "border-green-400 bg-green-50" : "border-gray-200"}`}
      onClick={selectMode ? () => onToggleSelect(item.productId) : undefined}
    >
      {selectMode && (
        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${selected ? "border-green-600 bg-green-600" : "border-gray-300"}`}>
          {selected && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          )}
        </div>
      )}
      {item.product.imageUrl && (
        <div className="relative h-16 w-16 shrink-0">
          <Image
            src={item.product.imageUrl}
            alt={item.product.name}
            fill
            sizes="64px"
            unoptimized
            className="object-contain"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 uppercase">{item.product.store}</p>
        <p className="text-sm font-semibold text-gray-900 truncate">{item.product.name}</p>
        {expired ? (
          <p className="text-xs text-red-500">
            Sale ended {item.product.originalPrice ? `— was $${item.product.salePrice.toFixed(2)}, now $${item.product.originalPrice.toFixed(2)}` : ""}
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">
              ${item.product.salePrice.toFixed(2)}
            </span>
            {item.product.originalPrice && (
              <span className="text-xs text-gray-400 line-through">
                ${item.product.originalPrice.toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>
      {!selectMode && (
        <button
          onClick={() => onRemove(item.productId)}
          className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          aria-label="Remove from cart"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  )
}
