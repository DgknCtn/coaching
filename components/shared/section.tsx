import { cn } from '@/lib/utils'

interface SectionProps {
  title?: string
  description?: string
  action?: React.ReactNode
  /**
   * Varsayılan 'plain': içerik sayfa zemininde durur. Kart sarmalayıcı bilinçli
   * olarak opt-in — her bölümü karta koymak arayüzü yorar.
   */
  variant?: 'plain' | 'card'
  children: React.ReactNode
  className?: string
  contentClassName?: string
}

export function Section({
  title,
  description,
  action,
  variant = 'plain',
  children,
  className,
  contentClassName,
}: SectionProps) {
  const hasHeader = Boolean(title || action)

  return (
    <section className={cn(className)}>
      {hasHeader && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div
        className={cn(
          variant === 'card' && 'overflow-hidden rounded-lg border bg-card',
          contentClassName
        )}
      >
        {children}
      </div>
    </section>
  )
}
