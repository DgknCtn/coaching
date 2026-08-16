'use client'

import { useEffect } from 'react'
import { reportError } from '@/lib/observability'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const isDev = process.env.NODE_ENV === 'development'

  useEffect(() => {
    reportError(error, { digest: error.digest, source: 'global-error-boundary' })
  }, [error])

  return (
    <html lang="tr">
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground px-6 text-center">
          <h2 className="text-xl font-semibold tracking-tight">Bir hata oluştu</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Beklenmedik bir sorun oluştu. Lütfen tekrar deneyin; sorun devam ederse
            daha sonra tekrar deneyebilirsiniz.
          </p>
          {isDev && (
            <pre className="max-w-lg overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
              {error.message}
            </pre>
          )}
          {/* Son çare hata sınırı: hiçbir bileşene bağımlı olmasın diye ham button. */}
          <button
            onClick={reset}
            className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  )
}
