import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type ColorScheme = 'blue' | 'emerald' | 'red' | 'amber' | 'indigo' | 'neutral'

const gradientMap: Record<ColorScheme, string | undefined> = {
  blue:    'linear-gradient(135deg, oklch(0.52 0.25 282), oklch(0.44 0.22 265))',
  indigo:  'linear-gradient(135deg, oklch(0.50 0.23 270), oklch(0.43 0.21 285))',
  emerald: 'linear-gradient(135deg, oklch(0.50 0.18 155), oklch(0.43 0.16 168))',
  red:     'linear-gradient(135deg, oklch(0.54 0.22 20),  oklch(0.47 0.20 8))',
  amber:   'linear-gradient(135deg, oklch(0.70 0.18 65),  oklch(0.62 0.21 48))',
  neutral: undefined,
}

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  subValue?: string
  badge?: string
  colorScheme?: ColorScheme
  highlight?: boolean
  className?: string
}

export function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  badge,
  colorScheme = 'neutral',
  highlight,
  className,
}: StatCardProps) {
  const isColored = colorScheme !== 'neutral'
  const gradient = gradientMap[colorScheme]

  if (isColored && gradient) {
    return (
      <div
        className={cn('rounded-2xl p-5 shadow-sm relative overflow-hidden', className)}
        style={{ background: gradient }}
      >
        {/* Subtle highlight overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />

        <div className="relative">
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0 backdrop-blur-sm">
              <Icon className="size-5 text-white" />
            </div>
            {badge && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/20 text-white backdrop-blur-sm">
                {badge}
              </span>
            )}
          </div>

          <p className="text-4xl font-bold tracking-tight text-white">
            {value}
            {subValue && (
              <span className="text-xl text-white/55 font-normal ml-1">{subValue}</span>
            )}
          </p>
          <p className="text-xs text-white/65 mt-1.5 font-semibold uppercase tracking-wider">{label}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('bg-card rounded-2xl border p-5 shadow-xs', className)}>
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        {badge && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <p className="text-4xl font-bold tracking-tight text-foreground">
        {value}
        {subValue && (
          <span className="text-xl text-muted-foreground font-normal ml-1">{subValue}</span>
        )}
      </p>
      <p className="text-xs text-muted-foreground mt-1.5 font-semibold uppercase tracking-wider">{label}</p>
    </div>
  )
}
