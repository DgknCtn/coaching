import { calculatePlanPace, calculatePlanTempo } from '@/lib/plan-pace'
import { formatTempo, formatUnitCount, formatUnitProgress } from '@/lib/unit-labels'
import type { UnitMode } from '@/lib/unit-labels'

interface PlanTempoCardProps {
  bookTitle: string
  startDate: string | null
  targetEndDate: string | null
  totalUnits: number
  completedUnits: number
  /** Kitabın takip türü (R6-01). Veli panelinde sayfa kaynağı için
   *  hiçbir yerde "test" ifadesi görünmemeli — kabul testi #5. */
  trackingMode?: UnitMode
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('tr-TR') : '—'
}

/**
 * Plan ve tempo özeti (R3 v2 §4). Veli tarafında operasyonel matris yerine
 * bu özet gösterilir: nerede olunduğu ve bugün hangi tempoya ihtiyaç
 * duyulduğu. "Önde/uyumlu/geride" ifadesi lib/plan-pace.ts'ten olduğu gibi
 * alınır — bu dosya kendi kıyaslama metnini üretmez.
 */
export function PlanTempoCard({
  bookTitle,
  startDate,
  targetEndDate,
  totalUnits,
  completedUnits,
  trackingMode,
}: PlanTempoCardProps) {
  const input = { startDate, targetEndDate, totalUnits, completedUnits, trackingMode }
  const tempo = calculatePlanTempo(input)
  const pace = calculatePlanPace(input)

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="truncate text-sm font-medium">{bookTitle}</h3>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {tempo.completionPercentage}%
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Kapsam</dt>
          <dd className="mt-0.5 tabular-nums">
            {formatUnitProgress(tempo.completedUnits, tempo.totalUnits, trackingMode)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Kalan</dt>
          <dd className="mt-0.5 tabular-nums">
            {formatUnitCount(tempo.remainingUnits, trackingMode)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Kalan hafta</dt>
          <dd className="mt-0.5 tabular-nums">
            {tempo.remainingWeeks === null ? '—' : tempo.remainingWeeks}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Başlangıç → hedef</dt>
          <dd className="mt-0.5 tabular-nums">
            {formatDate(startDate)} → {formatDate(targetEndDate)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Planlanan tempo</dt>
          <dd className="mt-0.5 tabular-nums">
            {formatTempo(tempo.initialPacePerWeek, trackingMode)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Güncel gerekli tempo</dt>
          <dd className="mt-0.5 tabular-nums">
            {tempo.isTargetReached
              ? `${formatUnitCount(tempo.remainingUnits, trackingMode)} (hedef tarihi geçti)`
              : formatTempo(tempo.requiredPacePerWeek, trackingMode)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">{pace.phrase}</p>
    </div>
  )
}
