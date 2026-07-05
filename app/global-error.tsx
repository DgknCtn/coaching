'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const isDev = process.env.NODE_ENV === 'development'

  return (
    <html lang="tr">
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground px-6 text-center">
          <h2 className="text-xl font-bold tracking-tight">Bir hata oluştu</h2>
          <p className="text-muted-foreground text-sm max-w-sm">
            Beklenmedik bir sorun oluştu. Lütfen tekrar deneyin; sorun devam ederse
            daha sonra tekrar deneyebilirsiniz.
          </p>
          {isDev && (
            <pre className="max-w-lg overflow-auto rounded-lg bg-muted p-3 text-left text-xs text-muted-foreground">
              {error.message}
            </pre>
          )}
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold shadow-sm"
          >
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  )
}
