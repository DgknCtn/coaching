import { cn } from '@/lib/utils'

/**
 * Halka (donut) gösterge.
 *
 * NEDEN AYRI BİR DOSYA: bu çizim `metric-tiles.tsx` içinde private bir
 * `Ring` fonksiyonuydu ve yalnız orada kullanılabiliyordu. R7 hedef
 * ekranlarında halka üç ayrı yerde geçiyor — KPI karosu, Öğrenci Genel
 * Bakış'taki "Bu Hafta" kartı ve Haftalık Akış'ın "Genel Durum" kartı.
 * Üçünü ayrı ayrı çizmek, üç farklı kalınlık ve üç farklı yuvarlama
 * demekti; aynı yüzde iki kartta farklı görünürdü.
 *
 * SVG İLE ÇİZİLİR: `stroke-dasharray` çevrenin oran kadarını boyar. Yeni
 * bağımlılık gerekmez ve halka her boyutta keskin kalır.
 *
 * RENK TEK BAŞINA ANLAM TAŞIMAZ: yüzde her zaman halkanın ortasında
 * yazar, çağıran da yanına etiketini koyar. Halkanın kendisi
 * `aria-hidden` — ekran okuyucu sayıyı metinden okur.
 */

export type RingTone = 'default' | 'success' | 'info' | 'warning' | 'destructive'

/** Halkanın dolu kısmının rengi. Zemin her tonda aynı nötr halkadır. */
const RING_TONE: Record<RingTone, string> = {
  default: 'text-primary',
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  destructive: 'text-destructive',
}

const SIZE: Record<'sm' | 'md' | 'lg', { box: string; text: string; stroke: number }> = {
  sm: { box: 'size-11', text: 'text-[10px]', stroke: 4 },
  md: { box: 'size-20', text: 'text-base', stroke: 5 },
  lg: { box: 'size-28', text: 'text-xl', stroke: 6 },
}

export function ProgressRing({
  value,
  tone = 'default',
  size = 'sm',
  className,
}: {
  /** 0–100. Aralık dışı değerler kırpılır (ProgressBar ile aynı kural). */
  value: number
  tone?: RingTone
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const safe = Math.max(0, Math.min(100, Math.round(value || 0)))
  const dims = SIZE[size]

  // viewBox sabit 40×40; ölçek dış kutudan gelir. Böylece kalınlık
  // oranı her boyutta aynı görünür.
  const radius = 20 - dims.stroke / 2
  const circumference = 2 * Math.PI * radius

  return (
    <span
      aria-hidden
      className={cn('relative flex shrink-0 items-center justify-center', dims.box, className)}
    >
      <svg viewBox="0 0 40 40" className={cn(dims.box, '-rotate-90')}>
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth={dims.stroke}
          className="stroke-muted"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth={dims.stroke}
          strokeLinecap="round"
          strokeDasharray={`${(circumference * safe) / 100} ${circumference}`}
          className={cn('stroke-current transition-[stroke-dasharray]', RING_TONE[tone])}
        />
      </svg>
      <span className={cn('absolute font-medium tabular-nums', dims.text)}>%{safe}</span>
    </span>
  )
}
