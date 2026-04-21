"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import type { ReactNode } from "react"

type CartContextValue = {
  cartProductIds: Set<string>
  toggle: (productId: string) => void
  isInCart: (productId: string) => boolean
  count: number
  isReady: boolean
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [cartProductIds, setCartProductIds] = useState<Set<string>>(new Set())
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (!session?.user) {
      setCartProductIds(new Set())
      setIsReady(true)
      return
    }

    fetch("/api/cart")
      .then((res) => res.json())
      .then((items: { productId: string }[]) => {
        setCartProductIds(new Set(items.map((i) => i.productId)))
      })
      .finally(() => setIsReady(true))
  }, [session?.user])

  const toggle = useCallback(
    async (productId: string) => {
      if (!session?.user) return

      const removing = cartProductIds.has(productId)

      setCartProductIds((prev) => {
        const next = new Set(prev)
        if (removing) next.delete(productId)
        else next.add(productId)
        return next
      })

      const res = await fetch("/api/cart", {
        method: removing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      })

      if (!res.ok) {
        setCartProductIds((prev) => {
          const next = new Set(prev)
          if (removing) next.add(productId)
          else next.delete(productId)
          return next
        })
      }
    },
    [session?.user, cartProductIds]
  )

  const isInCart = useCallback(
    (productId: string) => cartProductIds.has(productId),
    [cartProductIds]
  )

  return (
    <CartContext.Provider
      value={{ cartProductIds, toggle, isInCart, count: cartProductIds.size, isReady }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used within CartProvider")
  return ctx
}
