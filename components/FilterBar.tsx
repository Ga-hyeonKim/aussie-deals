"use client"

type Props = {
  categories: string[]
  selected: string | null
  onSelect: (category: string | null) => void
}

export default function FilterBar({ categories, selected, onSelect }: Props) {
  return (
    <>
      {/* Mobile: dropdown */}
      <div className="sm:hidden">
        <select
          value={selected ?? ""}
          onChange={e => onSelect(e.target.value || null)}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value="">All categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Desktop: pill buttons */}
      <div className="hidden sm:flex flex-wrap gap-2">
        <button
          onClick={() => onSelect(null)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            selected === null
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              selected === cat
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
    </>
  )
}
