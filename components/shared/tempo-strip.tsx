import { CalendarDays, CalendarCheck, LayoutGrid, CalendarClock, TrendingUp } from 'lucide-react'
import { calculatePlanTempo, type PlanTempoInput } from '@/lib/plan-pace'
import { cn } from '@/lib/utils'

/**
 * Plan ve tempo şeridi (R3 v2 §4): başlangıç/hedef tarihi, toplam/kalan hafta,
 * başlangıç planı (T/W) ve güncel gerekli tempo (R/Wr).
 *
 * Hesabın tamamı lib/plan-pace.ts'teki calculatePlanTempo'dan gelir; bu dosya
 * yalnızca sunum yapar, kendi formülünü kurmaz.
 */

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('tr-TR') : '—'
}

function formatPace(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('tr-TR')} test/hafta`
}

export function TempoStrip({ className, ...input }: PlanTempoInput & { className?: string }) {
  const tempo = calculatePlanTempo(input)

  const items = [
    { icon: CalendarDays, label: 'Başlangıç', value: formatDate(input.startDate) },
    { icon: CalendarCheck, label: 'Hedef bitiş', value: formatDate(input.targetEndDate) },
    {
      icon: LayoutGrid,
      label: 'Toplam hafta',
      value: tempo.totalWeeks === null ? '—' : String(tempo.totalWeeks),
    },
    {
      icon: CalendarClock,
      label: 'Kalan hafta',
      value: tempo.remainingWeeks === null ? '—' : String(tempo.remainingWeeks),
    },
    {
      icon: TrendingUp,
      label: 'Başlangıç planı',
      value: formatPace(tempo.initialPacePerWeek),
      accent: true,
    },
    {
      icon: TrendingUp,
      label: 'Güncel gerekli tempo',
      // Hedef tarihi geçmişse "kalan işin tamamı" anlamına gelir; tempo değil.
      value: tempo.isTargetReached
        ? `${tempo.remainingUnits} test kaldı`
        : formatPace(tempo.requiredPacePerWeek),
      accent: true,
    },
  ]

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 xl:grid-cols-6',
        className
      )}
    >
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2.5 bg-card px-4 py-3">
          <span
            aria-hidden
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md',
              item.accent ? 'bg-success-subtle text-success-foreground' : 'bg-muted text-muted-foreground'
            )}
          >
            <item.icon className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
