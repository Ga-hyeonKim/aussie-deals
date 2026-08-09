"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { useFavorites } from "@/hooks/useFavorites"

type Props = {
  storeProductId?: string | null
  productId: string
  onToggle?: () => void
}

export default function FavoriteButton({ storeProductId, productId, onToggle }: Props) {
  const { data: session } = useSession()
  const { isFavorited, toggle } = useFavorites()
  const [showToast, setShowToast] = useState(false)
  const id = storeProductId ?? productId
  const isProductFallback = !storeProductId
  const favorited = isFavorited(id)

  function handleClick() {
    if (!session?.user) {
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3000)
      return
    }
    toggle(id, isProductFallback)
    onToggle?.()
  }

  return (
    <>
      <button
        onClick={handleClick}
        aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
        className="shrink-0 text-xl leading-none transition-transform active:scale-90"
      >
        {favorited ? "❤️" : "🤍"}
      </button>
      {showToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl bg-gray-900 px-5 py-3 text-sm text-white shadow-xl">
          <span>Sign in to save favourites</span>
          <Link
            href="/login"
            className="shrink-0 font-bold text-green-400 hover:text-green-300 transition-colors"
          >
            Sign in
          </Link>
        </div>
      )}
    </>
  )
}
