"use client"

import { useEffect, useState } from "react"
import { useFavorites } from "@/hooks/useFavorites"
import ProductCard from "@/components/ProductCard"
import type { ProductModel } from "@/app/generated/prisma/models"

export default function FavoritesPage() {
  const { favorites } = useFavorites()
  const [products, setProducts] = useState<ProductModel[]>([])

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ids = [...favorites]

    if (ids.length === 0) {
      setProducts([])
      setLoading(false)
      return
    }

    fetch(`/api/products?ids=${ids.join(",")}`)
      .then(res => res.json())
      .then(data => setProducts(data))
      .finally(() => setLoading(false))
  }, [favorites])

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Favorites</h1>
          <p className="mt-1 text-gray-500">Items you&apos;ve saved</p>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : products.length === 0 ? (
          <p className="text-gray-400">No favorites yet. Tap ❤️ on any deal to save it.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
