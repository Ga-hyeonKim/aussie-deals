"use client"

import { useSession } from "next-auth/react"
import { useCart } from "@/hooks/useCart"

type Props = {
  productId: string
}

export default function CartButton({ productId }: Props) {
  const { data: session } = useSession()
  const { isInCart, toggle } = useCart()

  if (!session?.user) return null

  const inCart = isInCart(productId)

  return (
    <button
      onClick={() => toggle(productId)}
      aria-label={inCart ? "Remove from cart" : "Add to cart"}
      className={`rounded-full px-2 py-0.5 text-xs font-medium transition-all active:scale-95 ${
        inCart
          ? "bg-green-600 text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {inCart ? "In cart" : "+ Cart"}
    </button>
  )
}
