"use client"

import { useRouter } from "next/navigation"

export default function BackButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.back()}
      className="mb-6 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
    >
      ← Back
    </button>
  )
}
