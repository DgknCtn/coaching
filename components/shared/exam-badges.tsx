'use client'

import Link from 'next/link'
import { GraduationCap, Target, Timer } from 'lucide-react'
import { countdown, formatCountdown, nextExam, type NextExam } from '@/lib/exam-dates'
import { cn } from '@/lib/utils'

// SINAV GERİ SAYIMI VE PLAN ROZETİ.
//
// ============================================================
// NEDEN AYRI DOSYA
//
// Bu rozetler artık İKİ yerde görünüyor: öğretmen kabuğunun üst barında
// ve öğrenci çalışma masasında BAŞLIK HİZASINDA. R7/02 ikincisini şart
// koşuyor — *"Üstteki LGS / YKS / Sınırsız bilgi şeridi dikey alan
// tüketiyor; öğrenci başlığı hizasına alınmalı."*
//
// Kopyalansalardı iki ekran bir gün farklı eşiklerle farklı renkler
// gösterirdi; geri sayımın "son 30 gün kırmızı" kuralı iki yerde ayrı
// ayrı yazılırdı.
//
// ============================================================
// NEDEN İSTEMCİDE HESAPLANIYOR
//
// Geri sayım sunucuda render edilemez: sayfa önbelleğe alındığı anda
// donar ve kullanıcı saatlerce eskimiş bir rakama bakar. Sunucudan
// yalnız BİTİŞ ANI geliyor; kalan süre burada, tarayıcının saatiyle.
//
// HİDRASYON: ilk render'da hiçbir sayı basılmaz — sunucunun ürettiği
// HTML ile istemcinin ilk render'ı aynı olmak zorunda ve "kalan süre"
// tanımı gereği ikisinde farklı.
// ============================================================

export interface LicenseBadgeProps {
  /**
   * Deneme ya da lisans bitiş anı (ISO). Yoksa süre rozeti çizilmez —
   * sınırsız çalışma alanında dolmayan bir sayaç göstermek, olmayan bir
   * son tarihi varmış gibi gösterir.
   */
  licenseEndsAt?: string | null
  /** 'trial' → "Deneme", 'licensed' → "Plan". */
  licenseKind?: 'trial' | 'licensed'
  /** Rozet tıklanınca gidilecek yer. Verilmezse rozet bağlantı değil. */
  licenseHref?: string
  /** Bitiş tarihi OLMADIĞINDA yazacak metin ("Sınırsız" gibi). */
  licenseFallbackLabel?: string | null
}

function ExamChip({ exam, now, compact }: { exam: NextExam; now: Date; compact?: boolean }) {
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
        'flex shrink-0 items-center gap-1.5 rounded-full border text-xs',
        compact ? 'px-2 py-0.5' : 'px-2.5 py-1',
        urgent ? 'border-warning-border bg-warning-subtle' : 'border-border bg-muted/40'
      )}
    >
      <Icon
        className={cn(
          'size-3.5 shrink-0',
          urgent ? 'text-warning-foreground' : 'text-muted-foreground'
        )}
        aria-hidden
      />
      <span className="font-medium">{exam.label}</span>
      <span
        className={cn(
          'tabular-nums',
          urgent ? 'text-warning-foreground' : 'text-muted-foreground'
        )}
      >
        {/* "~" tahmini tarihi işaretler: kesin olmayanı kesin göstermek,
            geri sayımı hiç göstermemekten kötüdür. */}
        {exam.estimated && '~'}
        {formatCountdown(c)}
      </span>
    </span>
  )
}

export function ExamBadges({
  now,
  licenseEndsAt,
  licenseKind = 'trial',
  licenseHref,
  licenseFallbackLabel,
  compact,
}: LicenseBadgeProps & {
  /** Tarayıcı saati. null ise (ilk render) hiçbir sayı basılmaz. */
  now: Date | null
  /** Başlık hizasında kullanılan daha dar hâl. */
  compact?: boolean
}) {
  if (!now) return null

  const lgs = nextExam('lgs', now)
  const yks = nextExam('yks', now)
  const license = licenseEndsAt ? countdown(new Date(licenseEndsAt), now) : null

  const licenseBadge = (license || licenseFallbackLabel) && (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full border text-xs',
        compact ? 'px-2 py-0.5' : 'px-2.5 py-1',
        !license
          ? 'border-border bg-muted/40 text-muted-foreground'
          : license.passed || license.days < 1
            ? 'border-destructive-border bg-destructive-subtle text-destructive-foreground'
            : license.days <= 7
              ? 'border-warning-border bg-warning-subtle text-warning-foreground'
              : 'border-border bg-muted/40'
      )}
    >
      <Timer className="size-3.5 shrink-0" aria-hidden />
      {license ? (
        <>
          <span className="font-medium">{licenseKind === 'trial' ? 'Deneme' : 'Plan'}</span>
          {/* DAKİKA BURADA GÖSTERİLİR: kalan süre gün ölçeğinden saate
              indiğinde asıl bilgi dakikadır — "1 gün" yazan bir rozet, üç
              saat sonra kapanacak bir alanı sakinmiş gibi gösterir. */}
          <span className="tabular-nums">{formatCountdown(license, true)}</span>
        </>
      ) : (
        <span className="font-medium">{licenseFallbackLabel}</span>
      )}
    </span>
  )

  return (
    <>
      {lgs && <ExamChip exam={lgs} now={now} compact={compact} />}
      {yks && <ExamChip exam={yks} now={now} compact={compact} />}
      {licenseBadge &&
        (licenseHref ? (
          <Link href={licenseHref} className="shrink-0 rounded-full">
            {licenseBadge}
          </Link>
        ) : (
          <span className="shrink-0">{licenseBadge}</span>
        ))}
    </>
  )
}
