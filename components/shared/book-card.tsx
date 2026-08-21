import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/shared/progress-bar'
import { cn } from '@/lib/utils'

interface BookCardProps {
  book: {
    id: string
    title: string
    subject: string
    publisher?: string | null
    exam_type?: string | null
    sectionCount?: number
    testCount?: number
  }
  progress?: {
    completed: number
    total: number
    percentage: number
    targetDate?: string | null
  }
  href?: string
  className?: string
}

export function BookCard({ book, progress, href, className }: BookCardProps) {
  const inner = (
    <div
      className={cn(
        'group flex h-full flex-col rounded-lg border bg-card p-4 transition-colors',
        href && 'cursor-pointer hover:border-foreground/20',
        className
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h3 className="text-sm font-medium leading-snug">{book.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {book.subject}
              {book.publisher && ` · ${book.publisher}`}
            </p>
          </div>
        </div>
        {book.exam_type && (
          <Badge variant="neutral" className="shrink-0">
            {book.exam_type}
          </Badge>
        )}
      </div>

      {(book.sectionCount !== undefined || book.testCount !== undefined) && !progress && (
        <div className="mt-auto border-t pt-3 text-sm text-muted-foreground">
          {[
            book.sectionCount !== undefined ? `${book.sectionCount} bölüm` : null,
            book.testCount !== undefined ? `${book.testCount} test` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}

      {progress && (
        <div className="mt-auto space-y-2 border-t pt-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {progress.completed} / {progress.total} test tamamlandı
            </span>
            <span className="font-medium tabular-nums">{progress.percentage}%</span>
          </div>
          <ProgressBar value={progress.percentage} label={`${book.title} ilerlemesi`} />
          {progress.targetDate && (
            <p className="text-xs text-muted-foreground">
              Hedef: {new Date(progress.targetDate).toLocaleDateString('tr-TR')}
            </p>
          )}
        </div>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {inner}
      </Link>
    )
  }
  return inner
}
