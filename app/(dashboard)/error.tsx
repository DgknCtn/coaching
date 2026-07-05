'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-lg font-bold tracking-tight">Bir şeyler ters gitti</h2>
      <p className="text-muted-foreground text-sm max-w-sm">
        Bu sayfa yüklenirken bir sorun oluştu. Lütfen tekrar deneyin.
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
  )
}
