"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import type { ReactNode } from "react"

const STORAGE_KEY = "aussiedeals_favorites"

type FavoritesContextValue = {
  favorites: Set<string>
  toggle: (id: string, isProductFallback?: boolean) => void
  isFavorited: (id: string) => boolean
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const mergedRef = useRef(false)
  // maps productId → storeProductId for deals favorited before StoreProduct existed
  const productToStoreRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (status === "loading") return

    if (session?.user?.id) {
      fetch("/api/favorites")
        .then(res => res.json())
        .then(data => {
          const dbIds = new Set<string>(data.map((f: { storeProductId: string }) => f.storeProductId))

          if (!mergedRef.current) {
            mergedRef.current = true
            const stored = localStorage.getItem(STORAGE_KEY)
            if (stored) {
              const localIds = JSON.parse(stored) as string[]
              const toSync = localIds.filter(id => !dbIds.has(id))

              if (toSync.length > 0) {
                Promise.all(
                  toSync.map(storeProductId =>
                    fetch("/api/favorites", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ storeProductId }),
                    })
                  )
                ).then(() => {
                  toSync.forEach(id => dbIds.add(id))
                  setFavorites(new Set(dbIds))
                })
              } else {
                setFavorites(dbIds)
              }
              localStorage.removeItem(STORAGE_KEY)
            } else {
              setFavorites(dbIds)
            }
          } else {
            setFavorites(dbIds)
          }
        })
    } else {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setFavorites(new Set(JSON.parse(stored) as string[]))
      }
    }
  }, [session?.user?.id, status])

  const toggle = useCallback((id: string, isProductFallback = false) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      const removing = next.has(id)

      if (removing) {
        next.delete(id)
      } else {
        next.add(id)
      }

      if (session?.user?.id) {
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
          .then(res => res.json())
          .then(data => {
            if (!removing && isProductFallback && data.storeProductId) {
              productToStoreRef.current.set(id, data.storeProductId)
              setFavorites(prev2 => new Set([...prev2, data.storeProductId]))
            }
          })
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      }

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
