import { cn } from '@/lib/utils'

// Hero'daki yüzen bildirim kartı: ürünün bir anını tek cümleyle gösterir
// ("Ayşe Y. teslim etti → Onayla"). Hareket yalnız azaltılmış hareket
// tercihi KAPALIYSA (motion-safe) ve yalnız girişte.

export function FloatingCard({
  icon,
  title,
  detail,
  action,
  className,
  delayMs = 0,
}: {
  icon: React.ReactNode
  title: string
  detail: string
  action?: string
  className?: string
  delayMs?: number
}) {
  return (
    <div
      aria-hidden
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(
        'pointer-events-none flex w-64 items-start gap-3 rounded-xl border bg-card/95 p-3 shadow-xl shadow-primary/10 backdrop-blur',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-700',
        className
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug">{title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
      </div>
      {action && (
        <span className="shrink-0 rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground">
          {action}
        </span>
      )}
    </div>
  )
}
