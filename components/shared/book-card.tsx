import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { ProgressBar } from '@/components/shared/progress-bar'
import { formatUnitCount, unitLabel } from '@/lib/unit-labels'
import type { UnitMode } from '@/lib/unit-labels'
import { cn } from '@/lib/utils'

interface BookCardProps {
  book: {
    id: string
    title: string
    subject: string
    publisher?: string | null
    exam_type?: string | null
    level_exam?: string | null
    edition_year?: number | null
    /** Öğretim programı (R6-14). 'Belirtilmedi' ise gösterilmez. */
    curriculum_program?: string | null
    sectionCount?: number
    /** Takip birimi sayısı: test kitabında test, sayfa kitabında sayfa (022). */
    testCount?: number
    /** R6-01: birim etiketini belirler. Verilmezse "test" varsayılır. */
    tracking_mode?: UnitMode
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
      {/* R6-12 bilgi hiyerarşisi:
            1) Kitabın BİLİNEN ADI — ana başlık
            2) Yayın / Marka     — ikinci satır
            3) Ders · seviye · öğretim programı · baskı yılı — kompakt metadata
          "345 Matematik" başlığının altına "Matematik · 345" yazmak veritabanı
          hissi veren bir tekrardı; ders artık metadata satırında, marka ise
          kendi satırında duruyor. */}
      <div className="mb-3 flex min-w-0 items-start gap-3">
        <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium leading-snug">{book.title}</h3>

          {book.publisher && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{book.publisher}</p>
          )}

          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {[
              book.subject,
              book.level_exam || book.exam_type,
              book.curriculum_program && book.curriculum_program !== 'Belirtilmedi'
                ? book.curriculum_program
                : null,
              book.edition_year != null ? String(book.edition_year) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      {(book.sectionCount !== undefined || book.testCount !== undefined) && !progress && (
        <div className="mt-auto border-t pt-3 text-sm text-muted-foreground">
          {[
            book.sectionCount !== undefined ? `${book.sectionCount} bölüm` : null,
            book.testCount !== undefined
              ? formatUnitCount(book.testCount, book.tracking_mode)
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}

      {progress && (
        <div className="mt-auto space-y-2 border-t pt-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {progress.completed} / {progress.total} {unitLabel(book.tracking_mode)}{' '}
              tamamlandı
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
