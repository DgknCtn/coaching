'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { ExamBadges, type LicenseBadgeProps } from '@/components/shared/exam-badges'
import { isStudentWorkbenchPath } from '@/components/nav-config'

// ÜST BAR — sınav geri sayımları, kalan plan süresi, tema düğmesi.
//
// ============================================================
// ÖĞRENCİ ÇALIŞMA MASASINDA ÇİZİLMEZ (R7/02)
//
// Belgenin "SİL" maddesi: *"Global üst şerit — LGS / YKS / Sınırsız
// alanını ayrı bar olarak kaldır. Gerekli rozetleri öğrenci başlığı
// hizasında kompakt göster."* Gerekçesi de yazılı: şerit dikey alan
// tüketiyor ve Genel Bakış'ın ilk bloğunu ekrandan aşağı itiyordu.
//
// Rozetler kaybolmuyor, YER DEĞİŞTİRİYOR: öğrenci layout'u aynı
// `ExamBadges` bileşenini başlık hizasında çiziyor. Tema düğmesi de
// oraya taşındı — bu rotalarda bar hiç render edilmediği için burada
// bırakılsaydı erişilemez olurdu.
//
// NEDEN İSTEMCİDE: rotayı bilmek için `usePathname` gerekiyor ve geri
// sayım zaten tarayıcı saatiyle hesaplanıyor (bkz. exam-badges.tsx).
// ============================================================

const TICK_MS = 30_000

export function TopBar({
  licenseEndsAt,
  licenseKind = 'trial',
  licenseHref,
  licenseFallbackLabel,
}: LicenseBadgeProps) {
  const pathname = usePathname()
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  if (isStudentWorkbenchPath(pathname)) return null

  return (
    <div className="z-20 flex h-12 items-center justify-end gap-2 border-b bg-background/95 px-3 backdrop-blur md:sticky md:top-0 md:h-14 md:px-6">
      {/* MOBİLDE YATAY KAYDIRMA: üç rozet + tema düğmesi dar ekrana
          sığmıyor. Sıkıştırıp okunmaz hâle getirmektense kaydırılabilir
          bırakmak, en azından hepsini okunur tutuyor. */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Yer tutucu: sayılar istemcide gelene kadar bar aynı yükseklikte
            kalır, içerik zıplamaz. */}
        {!now ? (
          <span className="h-6" aria-hidden />
        ) : (
          <ExamBadges
            now={now}
            licenseEndsAt={licenseEndsAt}
            licenseKind={licenseKind}
            licenseHref={licenseHref}
            licenseFallbackLabel={licenseFallbackLabel}
          />
        )}
      </div>

      {/* TEMA DÜĞMESİ ARTIK BURADA. Sidebar'ın dibindeydi: menü
          daraltıldığında ya da mobil çekmece kapalıyken erişmek için
          önce menüyü açmak gerekiyordu. Sağ üst, bu düğmenin
          kullanıcıların ilk baktığı yer. */}
      <div className="hidden shrink-0 md:block">
        <ThemeToggle className="px-2" />
      </div>
    </div>
  )
}
