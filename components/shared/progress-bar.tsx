import { cn } from '@/lib/utils'

interface ProgressBarProps {
  /** 0–100. Aralık dışı değerler kırpılır. */
  value: number
  className?: string
  label?: string
  /** Dolgu rengi. Varsayılan 'primary' — mevcut kullanımlar değişmez. */
  /** R? / Faz 4: kota göstergesi uyarı ve sınır tonlarını da kullanıyor. */
  tone?: 'primary' | 'success' | 'warning' | 'destructive'
}

export function ProgressBar({ value, className, label, tone = 'primary' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value || 0)))

  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all',
          tone === 'success'
            ? 'bg-success'
            : tone === 'warning'
              ? 'bg-warning'
              : tone === 'destructive'
                ? 'bg-destructive'
                : 'bg-primary'
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
