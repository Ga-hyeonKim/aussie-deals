"use client"

import { useFavorites } from "@/hooks/useFavorites"

type Props = {
  storeProductId: string
}

export default function FavoriteButton({ storeProductId }: Props) {
  const { isFavorited, toggle } = useFavorites()
  const favorited = isFavorited(storeProductId)

  return (
    <button
      onClick={() => toggle(storeProductId)}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      className="text-xl leading-none transition-transform active:scale-90"
    >
      {favorited ? "❤️" : "🤍"}
    </button>
  )
}
