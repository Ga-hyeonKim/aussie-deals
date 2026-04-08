"use client"

import { createContext, useContext, useState, useEffect, useCallback } from "react"
import type { ReactNode } from "react"

const STORAGE_KEY = "aussiedeals_favorites"

type FavoritesContextValue = {
  favorites: Set<string>
  toggle: (productId: string) => void
  isFavorited: (productId: string) => boolean
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      setFavorites(new Set(JSON.parse(stored) as string[]))
    }
  }, [])

  const toggle = useCallback((productId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])

  const isFavorited = useCallback(
    (productId: string) => favorites.has(productId),
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
