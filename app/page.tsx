import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import DealsGrid from "@/components/DealsGrid"
import SearchBar from "@/components/SearchBar"

function formatDateRange(validFrom: Date): string {
  const from = new Date(validFrom)
  const to = new Date(from.getTime() + 6 * 24 * 60 * 60 * 1000)
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    timeZone: "Australia/Perth",
  }
  return `${from.toLocaleDateString("en-AU", opts)} – ${to.toLocaleDateString("en-AU", opts)}`
}

export default async function Home() {
  const now = new Date()

  const products = await prisma.product.findMany({
    where: {
      validFrom: { lte: now },
      validTo: { gte: now },
    },
    orderBy: { discountPercent: "desc" },
  })

  const categories = [...new Set(products.map((p) => p.category))].sort()
  const dateRange = products.length > 0 ? formatDateRange(products[0].validFrom) : null

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">This week&apos;s deals</h1>
          {dateRange ? (
            <p className="mt-1 text-gray-500">Woolworths specials for {dateRange}</p>
          ) : (
            <p className="mt-1 text-gray-500">Woolworths weekly specials</p>
          )}
        </div>

        {products.length === 0 ? (
          <p className="text-center text-gray-400 py-20">
            This week&apos;s specials have not been updated yet.
          </p>
        ) : (
          <>
            <div className="mb-6">
              <Suspense>
                <SearchBar />
              </Suspense>
            </div>
            <DealsGrid products={products} categories={categories} />
          </>
        )}
      </div>
    </main>
  )
}
