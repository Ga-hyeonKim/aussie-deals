"use client"

import { useState } from "react"
import { ProductModel } from "@/app/generated/prisma/models"
import ProductCard from "./ProductCard"
import FilterBar from "./FilterBar"

type Props = {
  products: ProductModel[]
  categories: string[]
}

export default function DealsGrid({ products, categories }: Props) {
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = selected
    ? products.filter((p) => p.category === selected)
    : products

  return (
    <div className="flex flex-col gap-6">
      <FilterBar categories={categories} selected={selected} onSelect={setSelected} />
      <p className="text-sm text-gray-500">{filtered.length} deals</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  )
}
