import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sparkline } from './charts/sparkline'

// KPI KARTI (dataviz: stat tile) — etiket · değer · değişim · eğilim.
//
// Değişim: önceki EŞİT döneme göre, işaretli. Rengi "yön × yukarısı iyi
// mi" belirler; renk tek başına anlam taşımaz (ok + yüzde yazılı).
// Önceki dönem sıfırsa yüzde yazılmaz (lib/admin/chart-scale).

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  change,
  upIsGood = true,
  href,
  tone = 'default',
}: {
  label: string
  value: string | number
  hint?: string
  icon?: LucideIcon
  trend?: number[]
  /** Önceki döneme göre yüzde; null = karşılaştırılamaz. */
  change?: number | null
  upIsGood?: boolean
  href?: string
  tone?: 'default' | 'warning' | 'destructive'
}) {
  const body = (
    <div
      className={cn(
        'flex h-full flex-col justify-between gap-2 rounded-lg border bg-card p-4 transition-colors',
        href && 'hover:bg-muted/40',
        tone === 'warning' && 'border-warning-border',
        tone === 'destructive' && 'border-destructive-border'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
            {change !== undefined && change !== null && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-medium',
                  change === 0
                    ? 'text-muted-foreground'
                    : (change > 0) === upIsGood
                      ? 'text-success-foreground'
                      : 'text-destructive-foreground'
                )}
              >
                {change > 0 ? (
                  <ArrowUpRight className="size-3" aria-hidden />
                ) : change < 0 ? (
                  <ArrowDownRight className="size-3" aria-hidden />
                ) : null}
                {change > 0 ? '+' : ''}
                {change}%
                <span className="sr-only"> önceki döneme göre</span>
              </span>
            )}
            {hint && <span className="text-muted-foreground">{hint}</span>}
          </div>
        </div>
        {trend && <Sparkline values={trend} />}
      </div>
    </div>
  )
  return href ? (
    <Link href={href} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
      {body}
    </Link>
  ) : (
    body
  )
}
