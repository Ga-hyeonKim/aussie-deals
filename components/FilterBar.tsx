"use client"

type Props = {
  categories: string[]
  selected: string | null
  onSelect: (category: string | null) => void
}

export default function FilterBar({ categories, selected, onSelect }: Props) {
  return (
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
  )
}
