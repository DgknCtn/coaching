'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { GraduationCap, Target, Timer } from 'lucide-react'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { countdown, formatCountdown, nextExam, type NextExam } from '@/lib/exam-dates'
import { cn } from '@/lib/utils'

// ÜST BAR — sınav geri sayımları, kalan plan süresi, tema düğmesi.
//
// ============================================================
// NEDEN İSTEMCİDE HESAPLANIYOR
//
// Geri sayım sunucuda render edilemez: sayfa önbelleğe alındığı anda
// donar ve kullanıcı saatlerce eskimiş bir rakama bakar. Sunucudan
// yalnız BİTİŞ ANI geliyor (deneme/lisans bitişi ISO metin olarak);
// kalan süre burada, tarayıcının saatiyle hesaplanıyor.
//
// HİDRASYON: ilk render'da hiçbir sayı basılmaz. Sunucunun ürettiği
// HTML ile istemcinin ilk render'ı aynı olmak zorunda ve "kalan süre"
// tanımı gereği ikisinde farklı. Bu yüzden sayılar `mounted` olduktan
// sonra görünür; yer tutucu aynı yüksekliği koruduğu için düzen
// zıplamaz.
//
// DAKİKADA BİR: saniye göstermiyoruz, dolayısıyla saniyede bir
// güncellemek boşuna iş. Sekme arka plandayken tarayıcı zaten
// zamanlayıcıyı kısıyor; sekmeye dönüldüğünde ilk tik'e kadar en fazla
// bir dakika eskimiş bir rakam görünür — gün/saat ölçeğinde fark etmez.
// ============================================================

const TICK_MS = 30_000

interface TopBarProps {
  /**
   * Deneme ya da lisans bitiş anı (ISO). Yoksa süre rozeti çizilmez —
   * sınırsız çalışma alanında dolmayan bir sayaç göstermek, olmayan bir
   * son tarihi varmış gibi gösterir.
   */
  licenseEndsAt?: string | null
  /** 'trial' → "Deneme", 'licensed' → "Plan". Rozet metnini belirler. */
  licenseKind?: 'trial' | 'licensed'
  /** Süre rozeti tıklanınca gidilecek yer. Verilmezse rozet bağlantı değil. */
  licenseHref?: string
}

function ExamChip({ exam, now }: { exam: NextExam; now: Date }) {
  const c = countdown(exam.date, now)
  const Icon = exam.id === 'lgs' ? Target : GraduationCap

  // Son 30 gün vurgulanır: bu eşikte geri sayım bir bilgi olmaktan çıkıp
  // günlük planlamayı belirleyen şeye dönüşür.
  const urgent = !c.passed && c.days <= 30

  return (
    <span
      title={`${exam.fullName}${exam.estimated ? ' (tahmini tarih)' : ''} · ${exam.date.toLocaleDateString(
        'tr-TR',
        { day: 'numeric', month: 'long', year: 'numeric' }
      )}`}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
        urgent ? 'border-warning-border bg-warning-subtle' : 'border-border bg-muted/40'
      )}
    >
      <Icon
        className={cn('size-3.5 shrink-0', urgent ? 'text-warning-foreground' : 'text-muted-foreground')}
        aria-hidden
      />
      <span className="font-medium">{exam.label}</span>
      <span className={cn('tabular-nums', urgent ? 'text-warning-foreground' : 'text-muted-foreground')}>
        {/* "~" tahmini tarihi işaretler: kesin olmayanı kesin göstermek,
            geri sayımı hiç göstermemekten kötüdür. */}
        {exam.estimated && '~'}
        {formatCountdown(c)}
      </span>
    </span>
  )
}

export function TopBar({ licenseEndsAt, licenseKind = 'trial', licenseHref }: TopBarProps) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const lgs = now ? nextExam('lgs', now) : null
  const yks = now ? nextExam('yks', now) : null

  const license = now && licenseEndsAt ? countdown(new Date(licenseEndsAt), now) : null

  const licenseBadge = license && (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
        license.passed || license.days < 1
          ? 'border-destructive-border bg-destructive-subtle text-destructive-foreground'
          : license.days <= 7
            ? 'border-warning-border bg-warning-subtle text-warning-foreground'
            : 'border-border bg-muted/40'
      )}
    >
      <Timer className="size-3.5 shrink-0" aria-hidden />
      <span className="font-medium">{licenseKind === 'trial' ? 'Deneme' : 'Plan'}</span>
      {/* DAKİKA BURADA GÖSTERİLİR: kalan süre gün ölçeğinden saate
          indiğinde asıl bilgi dakikadır — "1 gün" yazan bir rozet, üç
          saat sonra kapanacak bir alanı sakinmiş gibi gösterir. */}
      <span className="tabular-nums">{formatCountdown(license, true)}</span>
    </span>
  )

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
          <>
            {lgs && <ExamChip exam={lgs} now={now} />}
            {yks && <ExamChip exam={yks} now={now} />}
            {licenseBadge &&
              (licenseHref ? (
                <Link href={licenseHref} className="shrink-0 rounded-full">
                  {licenseBadge}
                </Link>
              ) : (
                <span className="shrink-0">{licenseBadge}</span>
              ))}
          </>
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
