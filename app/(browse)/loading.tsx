export default function Loading() {
    return (
        <main className="flex flex-1 items-center justify-center p-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
            <span className="sr-only">Loading</span>
        </main>
    )
}