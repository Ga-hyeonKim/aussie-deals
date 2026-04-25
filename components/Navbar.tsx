"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { useCart } from "@/hooks/useCart"

export default function Navbar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { count } = useCart()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2">
        <Link href="/">
          <Image src="/AussieDeals_Logo_latest.png" alt="AussieDeals" height={36} width={130} className="object-contain" />
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href="/"
            className={`text-sm font-medium transition-colors ${
              pathname === "/" ? "text-gray-900" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            Deals
          </Link>
          <Link
            href="/favorites"
            className={`transition-colors ${
              pathname === "/favorites" ? "text-gray-900" : "text-gray-400 hover:text-gray-700"
            }`}
            aria-label="Favorites"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-2.085c-1.034-1.062-2.135-2.455-2.627-4.008-.228-.698-.33-1.338-.327-1.975.005-1.375.56-2.666 1.475-3.614.93-.96 2.212-1.538 3.594-1.538 1.12 0 2.17.424 2.999 1.07C11.83 3.924 12.88 3.5 14 3.5c1.382 0 2.664.578 3.594 1.538.916.948 1.47 2.239 1.476 3.614.002.637-.1 1.277-.327 1.975-.493 1.553-1.594 2.946-2.628 4.008a22.044 22.044 0 01-2.582 2.085 20.76 20.76 0 01-1.162.682l-.019.01-.005.003h-.002a.739.739 0 01-.694 0l-.001-.001z" />
            </svg>
          </Link>
          <Link
            href="/search"
            className={`transition-colors ${
              pathname === "/search" ? "text-gray-900" : "text-gray-400 hover:text-gray-700"
            }`}
            aria-label="Search"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
          </Link>
          {session?.user && (
            <Link
              href="/cart"
              className={`relative transition-colors ${
                pathname === "/cart" ? "text-gray-900" : "text-gray-400 hover:text-gray-700"
              }`}
              aria-label="Cart"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M1 1.75A.75.75 0 011.75 1h1.628a1.5 1.5 0 011.427 1.05l.19.632H18.25a.75.75 0 01.716.97l-2 6.5A.75.75 0 0116.25 11H6.292l.234.78a.5.5 0 00.476.345h8.248a.75.75 0 010 1.5H7.002a2 2 0 01-1.905-1.382L2.78 3.28a.5.5 0 00-.476-.345H1.75A.75.75 0 011 2.185V1.75zM6 17.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
              </svg>
              {count > 0 && (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </Link>
          )}
          {session?.user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-gray-200 transition-all"
              >
                {session.user.image ? (
                  <Image
                    src={session.user.image}
                    alt=""
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-sm font-medium text-white">
                    {session.user.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
                  <div className="border-b border-gray-100 px-4 pb-2 mb-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {session.user.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {session.user.email}
                    </p>
                  </div>
                  <button
                    onClick={() => signOut()}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
