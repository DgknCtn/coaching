'use client'

import { useEffect } from 'react'
import { reportError } from '@/lib/observability'
import { Button } from '@/components/ui/button'

// Segment hata sınırı gövdesi.
//
// NEDEN VAR: hata sınırı yalnız kökte ve (dashboard) düzeyindeydi. Tek bir
// alt bileşenin hatası TÜM PANELİ düşürüyor, kullanıcı kenar çubuğunu bile
// kaybediyordu. Her panel kendi sınırını taşıdığında hata o segmentte
// kalır; gezinme ayakta kalır ve kullanıcı başka bir ekrana geçebilir.
//
// Tek bir gövde, dört segment: her `error.tsx` yalnız kendi kaynağını
// bildirir. Metin ve düğme kopyalanmaz — hata ekranlarının birbirinden
// ayrışması, en son fark edilecek tutarsızlık türüdür.

export function SegmentError({
  error,
  reset,
  source,
  title = 'Bu bölüm yüklenemedi',
  description = 'Sorun bu ekranla sınırlı. Tekrar deneyebilir ya da menüden başka bir sayfaya geçebilirsiniz.',
}: {
  error: Error & { digest?: string }
  reset: () => void
  /** Raporlamada hangi segment olduğunu ayırt etmek için. */
  source: string
  title?: string
  description?: string
}) {
  const isDev = process.env.NODE_ENV === 'development'

  useEffect(() => {
    reportError(error, { digest: error.digest, source })
  }, [error, source])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>

      {/* Ham hata yalnız geliştirmede: üretimde iç ayrıntı sızdırılmaz. */}
      {isDev && (
        <pre className="max-w-lg overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
          {error.message}
        </pre>
      )}

      <Button onClick={reset}>Tekrar dene</Button>
    </div>
  )
}
