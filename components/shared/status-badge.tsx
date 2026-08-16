import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type RiskStatus = 'red' | 'yellow' | 'green' | 'neutral'

// lib/plan-pace.ts çıktısı → semantik variant. Girdi sözleşmesi değişmedi.
const config: Record<
  RiskStatus,
  { label: string; variant: 'destructive' | 'warning' | 'success' | 'neutral' }
> = {
  red: { label: 'Kritik', variant: 'destructive' },
  yellow: { label: 'Dikkat', variant: 'warning' },
  green: { label: 'İyi', variant: 'success' },
  neutral: { label: '—', variant: 'neutral' },
}

interface StatusBadgeProps {
  status: RiskStatus | string
  label?: string
  className?: string
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const key = (status as RiskStatus) in config ? (status as RiskStatus) : 'neutral'
  const { label: defaultLabel, variant } = config[key]
  const displayLabel = label ?? defaultLabel

  return (
    <Badge variant={variant} className={cn(className)}>
      {displayLabel !== '—' && (
        <span className="size-1.5 shrink-0 rounded-full bg-current opacity-70" />
      )}
      {displayLabel}
    </Badge>
  )
}
