import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import ProductCard from "@/components/ProductCard"
import SearchBar from "@/components/SearchBar"

type Props = {
  searchParams: Promise<{ q?: string }>
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams
  const now = new Date()

  const products = q
    ? await prisma.product.findMany({
        where: {
          validFrom: { lte: now },
          validTo: { gte: now },
          name: { contains: q, mode: "insensitive" },
        },
        orderBy: { discountPercent: "desc" },
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

        {q && (
          <p className="mb-4 text-sm text-gray-500">
            {products.length} results for &quot;{q}&quot;
          </p>
        )}

        {!q && (
          <p className="text-sm text-gray-400">Type something to search this week&apos;s deals.</p>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </main>
  )
}
