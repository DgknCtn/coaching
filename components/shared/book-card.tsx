import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const subjectColors: Record<string, { bg: string; icon: string }> = {
  'Matematik':    { bg: 'bg-blue-50',   icon: 'text-blue-600' },
  'Fizik':        { bg: 'bg-violet-50', icon: 'text-violet-600' },
  'Kimya':        { bg: 'bg-emerald-50',icon: 'text-emerald-600' },
  'Biyoloji':     { bg: 'bg-green-50',  icon: 'text-green-600' },
  'Türkçe':       { bg: 'bg-rose-50',   icon: 'text-rose-600' },
  'Edebiyat':     { bg: 'bg-pink-50',   icon: 'text-pink-600' },
  'Tarih':        { bg: 'bg-amber-50',  icon: 'text-amber-600' },
  'Coğrafya':     { bg: 'bg-teal-50',   icon: 'text-teal-600' },
  'İngilizce':    { bg: 'bg-indigo-50', icon: 'text-indigo-600' },
  'Geometri':     { bg: 'bg-cyan-50',   icon: 'text-cyan-600' },
}

function getSubjectColor(subject: string) {
  return subjectColors[subject] ?? { bg: 'bg-primary/8', icon: 'text-primary' }
}

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
  const { bg, icon } = getSubjectColor(book.subject)

  const inner = (
    <div
      className={cn(
        'group bg-card rounded-2xl border p-5 shadow-xs h-full flex flex-col transition-all duration-200',
        href && 'hover:border-primary/35 hover:shadow-md hover:-translate-y-0.5 cursor-pointer',
        className
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', bg)}>
          <BookOpen className={cn('size-5', icon)} />
        </div>
        {book.exam_type && (
          <Badge variant="secondary" className="text-[11px] shrink-0 rounded-lg">{book.exam_type}</Badge>
        )}
      </div>

      <div className="flex-1 mb-3">
        <h3 className={cn(
          'font-bold text-sm leading-snug mb-1 transition-colors',
          href && 'group-hover:text-primary'
        )}>
          {book.title}
        </h3>
        <p className={cn('text-xs font-medium', icon)}>{book.subject}</p>
        {book.publisher && (
          <p className="text-xs text-muted-foreground/60 mt-0.5">{book.publisher}</p>
        )}
      </div>

      {(book.sectionCount !== undefined || book.testCount !== undefined) && !progress && (
        <div className="flex gap-3 text-xs text-muted-foreground pt-3 border-t">
          {book.sectionCount !== undefined && (
            <span className="font-medium">{book.sectionCount} bölüm</span>
          )}
          {book.sectionCount !== undefined && book.testCount !== undefined && (
            <span className="text-border">·</span>
          )}
          {book.testCount !== undefined && (
            <span className="font-medium">{book.testCount} test</span>
          )}
        </div>
      )}

      {progress && (
        <div className="pt-3 border-t space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{progress.completed} / {progress.total} test</span>
            <span className="font-bold text-foreground">{progress.percentage}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, progress.percentage)}%`,
                background: 'linear-gradient(90deg, oklch(0.57 0.26 282), oklch(0.65 0.22 300))',
              }}
            />
          </div>
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
    return <Link href={href} className="h-full block">{inner}</Link>
  }
  return inner
}
