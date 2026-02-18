'use client' // Error components must be Client Components

import { useEffect } from 'react'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error(error)
    }, [error])

    return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-xl font-bold text-red-600">Bir şeyler ters gitti!</h2>
            <p className="text-gray-600 max-w-md bg-gray-100 p-4 rounded text-left font-mono text-sm overflow-auto">
                {error.message || "Bilinmeyen Hata"}
            </p>
            {error.digest && (
                <p className="text-xs text-gray-400">Error ID: {error.digest}</p>
            )}
            <button
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                onClick={
                    // Attempt to recover by trying to re-render the segment
                    () => reset()
                }
            >
                Tekrar Dene
            </button>
            <button
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
                onClick={() => window.location.href = '/'}
            >
                Sayfayı Yenile
            </button>
        </div>
    )
}
