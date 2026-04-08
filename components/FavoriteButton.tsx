"use client"

import { useFavorites } from "@/hooks/useFavorites"

type Props = {
  productId: string
}

export default function FavoriteButton({ productId }: Props) {
  const { isFavorited, toggle } = useFavorites()
  const favorited = isFavorited(productId)

  return (
    <button
      onClick={() => toggle(productId)}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      className="text-xl leading-none transition-transform active:scale-90"
    >
      {favorited ? "❤️" : "🤍"}
    </button>
  )
}
