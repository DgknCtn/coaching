// Hafif, bağımlılıksız hata raporlama dikişi. Şu an yapısal JSON'u
// console'a yazar — Vercel bunları runtime loglarında yakalar. İleride
// Sentry/başka bir servis eklenmek istenirse yalnızca burası değişir,
// çağrı noktaları (error boundary'ler) aynı kalır.

interface ReportContext {
  digest?: string
  source?: string
  [key: string]: unknown
}

export function reportError(error: unknown, context: ReportContext = {}) {
  const payload = {
    level: 'error' as const,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
    at: new Date().toISOString(),
  }

  // Sunucuda da istemcide de çalışır; Vercel her ikisini de toplar.
  console.error('[reportError]', JSON.stringify(payload))
}
