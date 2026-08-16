import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * @deprecated Renk şeması kaldırıldı; metrikler artık nötr yüzeyde gösteriliyor.
 * Prop, çağrı yerleri temizlenene kadar no-op olarak imzada tutuluyor.
 */
type ColorScheme = 'blue' | 'emerald' | 'red' | 'amber' | 'indigo' | 'neutral'

interface StatCardProps {
  icon?: LucideIcon
  label: string
  value: string | number
  subValue?: string
  badge?: string
  /** @deprecated no-op */
  colorScheme?: ColorScheme
  /** @deprecated no-op */
  highlight?: boolean
  className?: string
}

export function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  badge,
  className,
}: StatCardProps) {
  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
        <p className="text-sm text-muted-foreground">{label}</p>
        {badge && (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
        {subValue && (
          <span className="ml-1 text-base font-normal text-muted-foreground">
            {subValue}
          </span>
        )}
      </p>
    </div>
  )
}
