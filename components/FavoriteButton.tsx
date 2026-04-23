"use client"

import { useFavorites } from "@/hooks/useFavorites"

type Props = {
  storeProductId?: string | null
  productId: string
}

export default function FavoriteButton({ storeProductId, productId }: Props) {
  const { isFavorited, toggle } = useFavorites()
  const id = storeProductId ?? productId
  const isProductFallback = !storeProductId
  const favorited = isFavorited(id)

  return (
    <button
      onClick={() => toggle(id, isProductFallback)}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      className="shrink-0 text-xl leading-none transition-transform active:scale-90"
    >
      {favorited ? "❤️" : "🤍"}
    </button>
  )
}
