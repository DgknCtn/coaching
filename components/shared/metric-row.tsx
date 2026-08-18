import Link from 'next/link'
import { cn } from '@/lib/utils'

export interface Metric {
  label: string
  value: string | number
  subValue?: string
  hint?: string
  /** Verilirse kart tıklanabilir olur (filtrelenmiş listeye gider). */
  href?: string
}

interface MetricRowProps {
  metrics: Metric[]
  className?: string
}

/**
 * KPI şeridi: 4 ayrı yüzen kart yerine tek bordered kap, içeride divide ile
 * bölünmüş. Görsel gürültüyü belirgin biçimde azaltır.
 */
export function MetricRow({ metrics, className }: MetricRowProps) {
  return (
    <div
      className={cn(
        // gap-px + zemin rengi: her kırılma noktasında tek piksel hairline,
        // nth-child border hilelerine gerek kalmadan.
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4',
        className
      )}
    >
      {metrics.map((m) => {
        const body = (
          <>
            <p className="text-sm text-muted-foreground">{m.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {m.value}
              {m.subValue && (
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  {m.subValue}
                </span>
              )}
            </p>
            {m.hint && <p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>}
          </>
        )

        return m.href ? (
          <Link
            key={m.label}
            href={m.href}
            className="bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {body}
          </Link>
        ) : (
          <div key={m.label} className="bg-card p-4">
            {body}
          </div>
        )
      })}
    </div>
  )
}
