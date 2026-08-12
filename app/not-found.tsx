import Link from "next/link"

export default function NotFound() {
    return (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <h1 className="text-lg font-semibold text-gray-900">Product not found</h1>
            <p className="max-w-xs text-sm text-gray-500">
                It may have come off special, or the link may be out of date.
            </p>
            <Link
                href="/"
                className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-medium text-white"
                >
                    Back to deals
                </Link>
        </main>
    )
}