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
    <div className={cn('flex items-start justify-between gap-4 mb-8 pb-6 border-b', className)}>
      <div className="flex items-center gap-3 min-w-0">
        {backHref && (
          <Link href={backHref} className="shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-xl border border-border/60 bg-card hover:bg-muted shadow-xs"
            >
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-extrabold tracking-tight truncate">{title}</h1>
            {badges}
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
