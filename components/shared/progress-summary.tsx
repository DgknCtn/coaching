import { calculatePlanPace } from '@/lib/plan-pace'
import { unitLabel } from '@/lib/unit-labels'
import type { UnitMode } from '@/lib/unit-labels'
import { ProgressBar } from '@/components/shared/progress-bar'
import { cn } from '@/lib/utils'

/**
 * "41 / 168 test tamamlandı · Plan çizgisinin 7 test gerisinde · %24,4"
 * Sayfa takipli kaynakta aynı satır "sayfa" birimiyle kurulur (R6-01).
 *
 * Karşılaştırma cümlesi lib/plan-pace.ts'ten OLDUĞU GİBİ alınır — o modülün
 * başındaki kural gereği başka hiçbir yer kendi "önde/geride" metnini üretmez.
 */
export function ProgressSummary({
  totalUnits,
  completedUnits,
  startDate,
  targetEndDate,
  label,
  trackingMode,
  className,
}: {
  totalUnits: number
  completedUnits: number
  startDate: string | null
  targetEndDate: string | null
  label: string
  /** Kitabın takip türü (R6-01) — yalnız etiketi belirler. */
  trackingMode?: UnitMode
  className?: string
}) {
  const pace = calculatePlanPace({
    startDate,
    targetEndDate,
    totalUnits,
    completedUnits,
    trackingMode,
  })
  const percentage = totalUnits === 0 ? 0 : (completedUnits / totalUnits) * 100

  return (
    <div className={cn('space-y-2.5 rounded-xl border bg-card px-4 py-3.5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm">
          <span className="font-semibold tabular-nums">
            {completedUnits} / {totalUnits}
          </span>{' '}
          <span className="text-muted-foreground">{unitLabel(trackingMode)} tamamlandı</span>
        </p>
        <div className="flex items-baseline gap-3">
          <span className="text-xs text-muted-foreground">{pace.phrase}</span>
          <span className="text-sm font-semibold tabular-nums">
            %{percentage.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
          </span>
        </div>
      </div>
      <ProgressBar value={percentage} label={label} tone="success" className="h-2" />
    </div>
  )
}
