'use client'

import { useEffect, useState } from 'react'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { ExamBadges, type LicenseBadgeProps } from '@/components/shared/exam-badges'

/**
 * Öğrenci başlığının sağ ucundaki rozetler (R7/02 "SİL" maddesi).
 *
 * Global üst şerit bu rotalarda hiç çizilmiyor (top-bar.tsx); rozetler
 * yok olmadı, öğrenci adının HİZASINA geçti. Belgenin gerekçesi:
 * *"Üstteki LGS / YKS / Sınırsız bilgi şeridi dikey alan tüketiyor."*
 * Kazanılan satır, "Bu Hafta" bloğunu ekranın ilk ekranına çıkarıyor.
 *
 * TEMA DÜĞMESİ DE BURADA: üst bar çizilmediği için orada bırakılsaydı
 * bu rotalarda hiç erişilemezdi.
 *
 * NEDEN CLIENT: geri sayım tarayıcı saatiyle hesaplanıyor; sunucuda
 * render edilse sayfa önbelleğe alındığı anda donardı.
 */
export function StudentHeaderBadges(props: LicenseBadgeProps) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="ml-auto flex shrink-0 items-center gap-1.5 print:hidden">
      <ExamBadges now={now} compact {...props} />
      <div className="hidden md:block">
        <ThemeToggle className="size-7 px-1.5" />
      </div>
    </div>
  )
}
