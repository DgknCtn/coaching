import Link from 'next/link'
import { type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-20 text-center px-6', className)}>
      <div className="relative mb-6">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, oklch(0.94 0.04 270), oklch(0.96 0.02 260))',
          }}
        >
          <Icon className="size-8 text-primary/40" />
        </div>
        <div
          className="absolute -inset-2 rounded-[28px] opacity-20 blur-lg"
          style={{ background: 'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))' }}
        />
      </div>
      <p className="text-sm font-bold text-foreground mb-1.5">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{description}</p>
      )}
      {action && (
        <div className="mt-6">
          {action.href ? (
            <Link href={action.href}>
              <Button variant="outline" size="sm" className="rounded-xl h-9 px-4 font-semibold">
                {action.label}
              </Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" className="rounded-xl h-9 px-4 font-semibold" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
