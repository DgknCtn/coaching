import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  backHref?: string
  action?: React.ReactNode
  badges?: React.ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, backHref, action, badges, className }: PageHeaderProps) {
  return (
    // Dar ekranda başlık ile eylem butonu yan yana sıkışıyordu; mobilde
    // alt alta, sm'den itibaren yan yana.
    <div
      className={cn(
        'mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {backHref && (
          <Button
            variant="ghost"
            size="icon-sm"
            render={<Link href={backHref} aria-label="Geri" />}
            className="shrink-0"
          >
            <ArrowLeft />
          </Button>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
            {badges}
          </div>
          {subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
    </div>
  )
}
