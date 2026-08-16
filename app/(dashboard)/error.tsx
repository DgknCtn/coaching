'use client'

import { useEffect } from 'react'
import { reportError } from '@/lib/observability'
import { Button } from '@/components/ui/button'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const isDev = process.env.NODE_ENV === 'development'

  useEffect(() => {
    reportError(error, { digest: error.digest, source: 'dashboard-error-boundary' })
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-xl font-semibold tracking-tight">Bir şeyler ters gitti</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Bu sayfa yüklenirken bir sorun oluştu. Lütfen tekrar deneyin.
      </p>
      {isDev && (
        <pre className="max-w-lg overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
          {error.message}
        </pre>
      )}
      <Button onClick={reset}>Tekrar dene</Button>
    </div>
  )
}
