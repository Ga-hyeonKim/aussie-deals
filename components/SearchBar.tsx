"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"

export default function SearchBar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams.get("q") ?? "")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
    } else {
      router.push("/search")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products..."
        className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-gray-400"
      />
      <button
        type="submit"
        className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
      >
        Search
      </button>
    </form>
  )
}
