import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * İkonlu KPI kartları şeridi.
 *
 * MetricRow ile karıştırmayın: MetricRow tek bordered kap içinde hairline ile
 * bölünmüş sade sayaçlar gösterir ve altı ekranda kullanılıyor. Bu bileşen
 * ayrı kartlar, durum rengi ve sağda ikon isteyen çalışma ekranı içindir.
 * İkisi bilinçli olarak ayrı tutuluyor — MetricRow'u genişletmek onu kullanan
 * tüm ekranları etkilerdi.
 */

export type MetricTone = 'default' | 'success' | 'info' | 'warning' | 'destructive'

export interface MetricTile {
  label: string
  value: string | number
  /** Değerin ve ikonun rengi. Renk tek başına anlam taşımaz — etiket her zaman yanında. */
  tone?: MetricTone
  icon?: LucideIcon
  /**
   * 0-100 arası oran. Verilirse ikonun yerine halka gösterge çizilir ve
   * yüzde halkanın ortasında yazar.
   *
   * Neden ikonun YERİNE: kartın sağ alanı tek bir görsel öğe için var; hem
   * halka hem ikon koymak kartı kalabalıklaştırır ve 6'lı ızgarada taşar.
   * Halka SVG ile çizilir, yeni bağımlılık gerekmez.
   */
  progress?: number
  /** Halkanın/değerin altına küçük bağlam satırı: "%66 Hedefe göre". */
  hint?: string
  /**
   * Verilirse kart tıklanabilir olur (filtrelenmiş listeye gider).
   *
   * MetricRow ile AYNI kural (R6-10 kabul #62): href'i olan sayaç değeri
   * sıfır olsa da tıklanabilir kalır. Aksi hâlde kullanıcı hangi kartın
   * tıklanabildiğini değere bakarak tahmin etmek zorunda kalırdı.
   */
  href?: string
}

const VALUE_TONE: Record<MetricTone, string> = {
  default: 'text-foreground',
  success: 'text-success-foreground',
  info: 'text-info-foreground',
  warning: 'text-warning-foreground',
  destructive: 'text-destructive-foreground',
}

const ICON_TONE: Record<MetricTone, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-success-subtle text-success-foreground',
  info: 'bg-info-subtle text-info-foreground',
  warning: 'bg-warning-subtle text-warning-foreground',
  destructive: 'bg-destructive-subtle text-destructive-foreground',
}

/** Halkanın dolu kısmının rengi. Zemin her tonda aynı nötr halkadır. */
const RING_TONE: Record<MetricTone, string> = {
  default: 'text-primary',
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  destructive: 'text-destructive',
}

/**
 * Küçük halka gösterge.
 *
 * `stroke-dasharray` ile çizilir: çevre uzunluğunun oran kadarı boyanır.
 * Yüzde metni halkanın ortasında durur; ekran okuyucu için kartın etiketi
 * zaten yanında olduğundan halka `aria-hidden`dır.
 */
function Ring({ value, tone }: { value: number; tone: MetricTone }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)))
  const radius = 16
  const circumference = 2 * Math.PI * radius

  return (
    <span aria-hidden className="relative flex size-11 shrink-0 items-center justify-center">
      <svg viewBox="0 0 40 40" className="size-11 -rotate-90">
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth="4"
          className="stroke-muted"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(circumference * safe) / 100} ${circumference}`}
          className={cn('stroke-current transition-[stroke-dasharray]', RING_TONE[tone])}
        />
      </svg>
      <span className="absolute text-[10px] font-medium tabular-nums">%{safe}</span>
    </span>
  )
}

export function MetricTiles({
  metrics,
  className,
}: {
  metrics: MetricTile[]
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6',
        className
      )}
    >
      {metrics.map(metric => {
        const tone = metric.tone ?? 'default'
        const Icon = metric.icon
        const hasRing = typeof metric.progress === 'number'
        const body = (
          <>
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{metric.label}</p>
              <p
                className={cn(
                  'mt-1.5 text-2xl font-semibold tabular-nums tracking-tight',
                  VALUE_TONE[tone]
                )}
              >
                {metric.value}
              </p>
              {metric.hint && (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{metric.hint}</p>
              )}
            </div>
            {hasRing ? (
              <Ring value={metric.progress as number} tone={tone} />
            ) : (
              Icon && (
              <span
                aria-hidden
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-md',
                  ICON_TONE[tone]
                )}
              >
                <Icon className="size-3.5" />
              </span>
              )
            )}
          </>
        )

        const shell =
          'flex items-start justify-between gap-2 rounded-xl border bg-card px-4 py-3'

        return metric.href ? (
          <Link
            key={metric.label}
            href={metric.href}
            className={cn(
              shell,
              'transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            {body}
          </Link>
        ) : (
          <div key={metric.label} className={shell}>
            {body}
          </div>
        )
      })}
    </div>
  )
}
