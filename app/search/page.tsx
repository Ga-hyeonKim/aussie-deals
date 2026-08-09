import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import SearchBar from "@/components/SearchBar"
import Image from "next/image"
import Link from "next/link"
import FavoriteButton from "@/components/FavoriteButton"

type Props = {
  searchParams: Promise<{ q?: string }>
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams

  const products = q
    ? await prisma.storeProduct.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        take: 200,
        orderBy: { name: "asc" },
      })
    : []

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Search</h1>
        </div>

        <div className="mb-6">
          <Suspense>
            <SearchBar />
          </Suspense>
        </div>

        {q ? (
          <p className="mb-4 text-sm text-gray-500">
            {products.length} results for &quot;{q}&quot;
          </p>
        ) : (
          <p className="text-sm text-gray-400">Search all Woolworths &amp; Coles products.</p>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <div key={product.id} className="relative rounded-2xl border border-gray-200 bg-white p-3 shadow-sm flex flex-col gap-2">
              <Link href={`/store-product/${product.id}`} className="absolute inset-0 z-0 rounded-2xl" aria-label={product.name} />
              {product.imageUrl && (
                <div className="relative mx-auto h-20 w-20">
                  <Image src={product.imageUrl} alt={product.name} fill sizes="80px" unoptimized className="object-contain" />
                </div>
              )}
              <div className="min-w-0">
                <p className={`text-xs uppercase tracking-wide font-medium ${product.store === "COLES" ? "text-red-500" : "text-green-600"}`}>
                  {product.store === "COLES" ? "Coles" : "Woolworths"}
                </p>
                <h2 className="truncate text-sm font-semibold text-gray-900 leading-tight">{product.name}</h2>
              </div>
              <p className="text-base font-bold text-gray-900">${product.price.toFixed(2)}</p>
              <div className="relative z-10 flex justify-end">
                <FavoriteButton storeProductId={product.id} productId={product.id} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
