import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'info' | 'warning' | 'success' | 'destructive'

const toneConfig: Record<Tone, { icon: LucideIcon; className: string; iconClass: string }> = {
  info: {
    icon: Info,
    className: 'border-info-border bg-info-subtle',
    iconClass: 'text-info',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-warning-border bg-warning-subtle',
    iconClass: 'text-warning',
  },
  success: {
    icon: CheckCircle2,
    className: 'border-success-border bg-success-subtle',
    iconClass: 'text-success',
  },
  destructive: {
    icon: XCircle,
    className: 'border-destructive-border bg-destructive-subtle',
    iconClass: 'text-destructive',
  },
}

interface AlertBannerProps {
  tone?: Tone
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function AlertBanner({
  tone = 'info',
  title,
  description,
  action,
  className,
}: AlertBannerProps) {
  const { icon: Icon, className: toneClass, iconClass } = toneConfig[tone]

  return (
    <div className={cn('flex items-start gap-3 rounded-lg border p-4', toneClass, className)}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', iconClass)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
