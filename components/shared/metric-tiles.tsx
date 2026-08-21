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
        return (
          <div
            key={metric.label}
            className="flex items-start justify-between gap-2 rounded-xl border bg-card px-4 py-3"
          >
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
            </div>
            {Icon && (
              <span
                aria-hidden
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-md',
                  ICON_TONE[tone]
                )}
              >
                <Icon className="size-3.5" />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
