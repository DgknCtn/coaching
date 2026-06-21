'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="tr">
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
          <h2 className="text-xl font-semibold">Bir hata oluştu</h2>
          <p className="text-gray-500 text-sm">{error.message}</p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-black text-white rounded-md text-sm"
          >
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  )
}
