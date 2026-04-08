"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const links = [
  { href: "/", label: "Deals" },
  { href: "/search", label: "Search" },
  { href: "/favorites", label: "Favorites" },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-bold text-gray-900">
          AussieDeals
        </Link>
        <nav className="flex gap-6">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-medium transition-colors ${
                pathname === href
                  ? "text-gray-900"
                  : "text-gray-400 hover:text-gray-700"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
