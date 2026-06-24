import { cn } from '@/lib/utils'

type RiskStatus = 'red' | 'yellow' | 'green' | 'neutral'

const config: Record<RiskStatus, { label: string; dot: string; className: string }> = {
  red: {
    label: 'Kritik',
    dot: 'bg-red-500',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
  yellow: {
    label: 'Dikkat',
    dot: 'bg-amber-500',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  green: {
    label: 'İyi',
    dot: 'bg-emerald-500',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  neutral: {
    label: '—',
    dot: 'bg-muted-foreground/40',
    className: 'bg-muted text-muted-foreground border-transparent',
  },
}

interface StatusBadgeProps {
  status: RiskStatus | string
  label?: string
  className?: string
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const key = (status as RiskStatus) in config ? (status as RiskStatus) : 'neutral'
  const { label: defaultLabel, dot, className: colorClass } = config[key]
  const displayLabel = label ?? defaultLabel

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border',
        colorClass,
        className
      )}
    >
      {displayLabel !== '—' && (
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} />
      )}
      {displayLabel}
    </span>
  )
}
