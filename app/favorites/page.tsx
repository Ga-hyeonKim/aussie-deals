import { Suspense } from "react"
import FavoritesClient from "@/components/FavoritesClient"

// FavoritesClient reads `?q=` via useSearchParams, which has no value during the
// build-time prerender. The boundary marks how much of the page waits for the
// client so the rest can still be prerendered — without it the build fails.
export default function FavoritesPage() {
  return (
    <Suspense fallback={<FavoritesShell />}>
      <FavoritesClient />
    </Suspense>
  )
}

function FavoritesShell() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold text-gray-900">Favorites</h1>
        <p className="mt-1 text-gray-500">Save products you want — we&apos;ll show you when they go on sale.</p>
      </div>
    </main>
  )
}
