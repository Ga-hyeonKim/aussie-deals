"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import type { ReactNode } from "react"

type FavoritesContextValue = {
  favorites: Set<string>
  toggle: (id: string, isProductFallback?: boolean) => void
  isFavorited: (id: string) => boolean
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const productToStoreRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (status === "loading") return

    if (session?.user?.id) {
      fetch("/api/favorites")
        .then(res => res.json())
        .then(data => {
          setFavorites(new Set<string>(data.map((f: { storeProductId: string }) => f.storeProductId)))
        })
    } else {
      setFavorites(new Set())
    }
  }, [session?.user?.id, status])

  const toggle = useCallback((id: string, isProductFallback = false) => {
    if (!session?.user?.id) return

    setFavorites((prev) => {
      const next = new Set(prev)
      const removing = next.has(id)

      if (removing) {
        next.delete(id)
      } else {
        next.add(id)
      }

      let body: Record<string, string>
      if (isProductFallback) {
        const resolved = productToStoreRef.current.get(id)
        body = resolved ? { storeProductId: resolved } : { productId: id }
      } else {
        body = { storeProductId: id }
      }

      fetch("/api/favorites", {
        method: removing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(res => (res.ok && !removing ? res.json() : null))
        .then(data => {
          if (!removing && isProductFallback && data?.storeProductId) {
            productToStoreRef.current.set(id, data.storeProductId)
            setFavorites(prev2 => new Set([...prev2, data.storeProductId]))
          }
        })
        .catch(() => {})

      return next
    })
  }, [session?.user?.id])

  const isFavorited = useCallback(
    (id: string) => favorites.has(id),
    [favorites]
  )

  return (
    <FavoritesContext.Provider value={{ favorites, toggle, isFavorited }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider")
  return ctx
}
