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

export default function CartPage() {
  const { data: session } = useSession()
  const { toggle } = useCart()
  const [items, setItems] = useState<CartItemWithProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [undoItem, setUndoItem] = useState<CartItemWithProduct | null>(null)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!session?.user) {
      setLoading(false)
      return
    }
    fetch("/api/cart")
      .then((res) => res.json())
      .then((data) => setItems(data))
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
  const activeItems = items.filter((i) => new Date(i.product.validTo) >= now)
  const expiredItems = items.filter((i) => new Date(i.product.validTo) < now)
  const activeTotal = activeItems.reduce((sum, i) => sum + i.product.salePrice, 0)

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

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Cart</h1>
          <p className="mt-1 text-gray-500">
            {items.length === 0 && !loading
              ? "Your cart is empty"
              : `${activeItems.length} item${activeItems.length !== 1 ? "s" : ""} on sale`}
          </p>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-gray-400">
            Browse <Link href="/" className="text-green-600 underline">this week&apos;s deals</Link> and add items to your cart.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {activeItems.length > 0 && (
              <div className="flex flex-col gap-3">
                {activeItems.map((item) => (
                  <CartRow key={item.id} item={item} expired={false} onRemove={handleRemove} />
                ))}
                <div className="flex justify-between border-t border-gray-200 pt-4 mt-2">
                  <span className="font-semibold text-gray-900">Estimated total</span>
                  <span className="font-bold text-gray-900">${activeTotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            {expiredItems.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-gray-400 mb-3">Sale ended</h2>
                <div className="flex flex-col gap-3 opacity-60">
                  {expiredItems.map((item) => (
                    <CartRow key={item.id} item={item} expired={true} onRemove={handleRemove} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {undoItem && (
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
    </main>
  )
}

function CartRow({
  item,
  expired,
  onRemove,
}: {
  item: CartItemWithProduct
  expired: boolean
  onRemove: (productId: string) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
      {item.product.imageUrl && (
        <div className="relative h-16 w-16 shrink-0">
          <Image
            src={item.product.imageUrl}
            alt={item.product.name}
            fill
            sizes="64px"
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
      <button
        onClick={() => onRemove(item.productId)}
        className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        aria-label="Remove from cart"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  )
}
