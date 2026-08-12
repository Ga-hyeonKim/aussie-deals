"use client"

export default function GlobalError({
    error, 
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <html lang="en">
            <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
                <h1 className="text-lg font-semibold text-gray-900">Something went wrong</h1>
                <button
                    onClick={reset}
                    className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white"
                    >
                        Try again
                    </button>
                    {error.digest && (
                        <p className="text-xs text-gray-400">Reference: {error.digest}</p>
                    )}
            </body>
        </html>
    )
}