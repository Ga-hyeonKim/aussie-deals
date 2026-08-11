import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import { isRealDeal } from "@/lib/deal"
import DealsGrid from "@/components/DealsGrid"

export const dynamic = "force-dynamic"

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

  // A live Product row is not proof of a discount — see lib/deal.ts. Drop the
  // ones with no regular price at the database, then check the actual gap.
  const rows = await prisma.product.findMany({
    where: {
      validFrom: { lte: now },
      validTo: { gte: now },
      originalPrice: { not: null },
    },
    orderBy: { discountPercent: { sort: "desc", nulls: "last" } },
  })
  const products = rows.filter(isRealDeal)

  const dateRange = products.length > 0 ? formatDateRange(products[0].validFrom) : null

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">This week&apos;s deals</h1>
          {dateRange ? (
            <p className="mt-1 text-gray-500">Woolworths & Coles specials · {dateRange}</p>
          ) : (
            <p className="mt-1 text-gray-500">Weekly specials</p>
          )}
        </div>

        {products.length === 0 ? (
          <p className="text-center text-gray-400 py-20">
            This week&apos;s specials have not been updated yet.
          </p>
        ) : (
          <Suspense>
            <DealsGrid products={products} />
          </Suspense>
        )}
      </div>
    </main>
  )
}
