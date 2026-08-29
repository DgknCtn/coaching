'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ProgressBar } from '@/components/shared/progress-bar'
import type { HomeworkDetailBook } from '@/lib/homework-detail'
import { formatUnitCount } from '@/lib/unit-labels'
import { cn } from '@/lib/utils'

interface HomeworkBatchRowProps {
  title: string | null
  dueDate: string
  completed: number
  total: number
  isOverdue: boolean
  /** Başlık yokken tarihin hangi biçimde yazılacağı. */
  dateStyle?: Intl.DateTimeFormatOptions
  /**
   * Açılabilir içerik detayı (R6-06): kaynak > bölüm > aralık.
   * Verilmezse kart bugünkü gibi kompakt ve statik kalır.
   */
  detail?: HomeworkDetailBook[]
  /** Ödev notu (R6-05). Boşsa detayda hiç başlık gösterilmez. */
  note?: string | null
}

const defaultDateStyle: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
}

/**
 * ISO olmayan tarih dizeleri (ör. demo verisindeki "18 Haziran 2026") için
 * "Invalid Date" basmak yerine değeri olduğu gibi göster.
 */
function formatDate(value: string, style?: Intl.DateTimeFormatOptions) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('tr-TR', style)
}

/**
 * Ödev paketi satırı.
 *
 * Kapalıyken kompakt kalır (kabul #40); açıldığında hangi kaynak/bölüm/
 * aralıkların verildiğini gösterir. Açma/kapama YALNIZ görsel bir durumdur —
 * ödevin durumunu değiştirmez ve sunucuya hiçbir şey yazmaz (#44).
 */
export function HomeworkBatchRow({
  title,
  dueDate,
  completed,
  total,
  isOverdue,
  dateStyle = defaultDateStyle,
  detail,
  note,
}: HomeworkBatchRowProps) {
  const [open, setOpen] = useState(false)

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const isComplete = total > 0 && completed === total
  const label = title ?? formatDate(dueDate, dateStyle)

  const trimmedNote = note?.trim()
  const expandable = (detail?.length ?? 0) > 0 || Boolean(trimmedNote)

  const header = (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {expandable &&
            (open ? (
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            ))}
          <p className="truncate text-sm font-medium">{label}</p>
          {isOverdue && <Badge variant="warning">Gecikmiş</Badge>}
          {isComplete && !isOverdue && <Badge variant="success">Tamamlandı</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Teslim: {formatDate(dueDate)}</p>
        {total > 0 && (
          <ProgressBar value={pct} label={`${label} ilerlemesi`} className="mt-2 max-w-[120px]" />
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm tabular-nums">
          {completed}
          <span className="text-muted-foreground">/{total}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">tamamlandı</p>
      </div>
    </div>
  )

  if (!expandable) return header

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={cn(
          'w-full text-left transition-colors hover:bg-muted/40',
          open && 'bg-muted/20'
        )}
      >
        {header}
      </button>

      {open && (
        <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
          {detail?.map(book => (
            <div key={book.bookTitle} className="space-y-1">
              <p className="flex items-baseline justify-between gap-2 text-xs font-medium">
                <span className="truncate">{book.bookTitle}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatUnitCount(book.count, book.trackingMode)}
                </span>
              </p>
              <ul className="space-y-0.5">
                {book.sections.map(section => (
                  <li
                    key={section.title}
                    className="flex items-start justify-between gap-2 text-[11px] text-muted-foreground"
                  >
                    <span className="truncate">{section.title}</span>
                    <span className="shrink-0 tabular-nums">→ {section.units}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {trimmedNote && (
            <p className="border-t pt-2 text-xs">
              <span className="font-medium">Not: </span>
              <span className="text-muted-foreground">{trimmedNote}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
