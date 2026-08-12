"use client"

import { useEffect } from "react"

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("[page error]", error)
    }, [error])

    return (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <h1 className="text-lg font-semibold text-gray-900">
                Couldn&apos;t load this page
            </h1>
            <p className="max-w-xs text-sm text-gray-500">
                The database may be waking up. This usually clears in a few seconds.
            </p>
            <button onClick={reset}
            className="rounded-xl bg-gray-900 px-5 text-sm font-medium text-white">
                Try again
            </button>
            {error.digest && (
                <p className="text-xs text-gray-400">Reference: {error.digest}</p>
            )}
        </main>
    )
}