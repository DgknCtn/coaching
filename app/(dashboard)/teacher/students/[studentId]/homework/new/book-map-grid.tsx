'use client'

import { Check, Clock3, AlertTriangle, Undo2, Circle } from 'lucide-react'
import type { BookMapBook } from '@/lib/book-map'
import { isSelectableState } from '@/lib/book-map'
import { testStateLabel, type HomeworkTestState } from '@/lib/homework-status'
import { cn } from '@/lib/utils'

// Masaüstü Kitap Haritası (R3 v2 §1). Bölüm satır, test sütun.
// Ağır grid kütüphanesi yok: normal table + sticky bölüm sütunu + yatay kaydırma.
// Hücreler pastel zemin + ikon taşır; yalnız renge güvenilmez.

const STATE_STYLE: Record<HomeworkTestState, string> = {
  completed: 'bg-success-subtle text-success-foreground border-success-border',
  pending_approval: 'bg-info-subtle text-info-foreground border-info-border',
  assigned: 'bg-warning-subtle text-warning-foreground border-warning-border',
  returned: 'bg-warning-subtle text-warning-foreground border-warning-border',
  overdue: 'bg-destructive-subtle text-destructive-foreground border-destructive-border',
  not_assigned: 'bg-card text-muted-foreground border-border',
  no_test: 'bg-muted/60 text-muted-foreground/50 border-transparent',
}

const STATE_ICON: Record<HomeworkTestState, typeof Check | null> = {
  completed: Check,
  pending_approval: Clock3,
  assigned: Circle,
  returned: Undo2,
  overdue: AlertTriangle,
  not_assigned: null,
  no_test: null,
}

/** Harita lejantı — renk tek başına anlam taşımadığı için her zaman gösterilir. */
const LEGEND: HomeworkTestState[] = [
  'completed',
  'pending_approval',
  'assigned',
  'overdue',
  'not_assigned',
  'no_test',
]

export function BookMapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {LEGEND.map(state => {
        const Icon = STATE_ICON[state]
        return (
          <span key={state} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                'flex size-4 items-center justify-center rounded border',
                STATE_STYLE[state]
              )}
            >
              {Icon && <Icon className="size-2.5" />}
            </span>
            {testStateLabel(state, 'teacher')}
          </span>
        )
      })}
    </div>
  )
}

interface Props {
  book: BookMapBook
  selectedTestIds: Set<string>
  onToggleTest: (bookId: string, testId: string) => void
  onToggleSection: (bookId: string, testIds: string[]) => void
}

export function BookMapGrid({ book, selectedTestIds, onToggleTest, onToggleSection }: Props) {
  const columns = Array.from({ length: book.maxTestsPerSection }, (_, i) => i)

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-20 min-w-56 border-b border-r bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground"
            >
              Bölüm
            </th>
            {columns.map(i => (
              <th
                key={i}
                scope="col"
                className="border-b bg-card px-1 py-2 text-center text-xs font-medium tabular-nums text-muted-foreground"
              >
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {book.sections.map(section => {
            const selectableIds = section.tests
              .filter(t => isSelectableState(t.state))
              .map(t => t.id)
            const allSelected =
              selectableIds.length > 0 && selectableIds.every(id => selectedTestIds.has(id))

            return (
              <tr key={section.id} className="group">
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-56 max-w-72 border-b border-r bg-card px-3 py-1.5 text-left font-normal group-hover:bg-muted/40"
                >
                  <button
                    type="button"
                    onClick={() => onToggleSection(book.bookId, selectableIds)}
                    disabled={selectableIds.length === 0}
                    className="flex w-full items-center justify-between gap-2 rounded text-left disabled:cursor-default"
                    title={
                      selectableIds.length === 0
                        ? 'Bu bölümde seçilebilir test yok'
                        : allSelected
                          ? 'Bölüm seçimini kaldır'
                          : 'Bölümdeki seçilebilir testleri seç'
                    }
                  >
                    <span className="truncate text-xs">{section.title}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {section.completedCount}/{section.tests.length}
                    </span>
                  </button>
                </th>

                {columns.map(i => {
                  const test = section.tests[i]

                  if (!test) {
                    return (
                      <td key={i} className="border-b p-0.5">
                        <span
                          className={cn(
                            'flex size-7 items-center justify-center rounded border',
                            STATE_STYLE.no_test
                          )}
                        >
                          <span className="sr-only">{testStateLabel('no_test', 'teacher')}</span>
                        </span>
                      </td>
                    )
                  }

                  const Icon = STATE_ICON[test.state]
                  const selectable = isSelectableState(test.state)
                  const selected = selectedTestIds.has(test.id)
                  const label = section.title + ' / ' + test.title + ' — ' + testStateLabel(test.state, 'teacher')

                  return (
                    <td key={test.id} className="border-b p-0.5">
                      <button
                        type="button"
                        disabled={!selectable}
                        aria-pressed={selectable ? selected : undefined}
                        onClick={() => onToggleTest(book.bookId, test.id)}
                        title={label}
                        aria-label={label}
                        className={cn(
                          'flex size-7 items-center justify-center rounded border transition-colors',
                          STATE_STYLE[test.state],
                          selectable && 'cursor-pointer hover:brightness-95',
                          !selectable && 'cursor-not-allowed',
                          selected && 'ring-2 ring-primary ring-offset-1 ring-offset-card'
                        )}
                      >
                        {selected ? (
                          <Check className="size-3.5 text-primary" />
                        ) : Icon ? (
                          <Icon className="size-3" />
                        ) : (
                          <span className="text-[10px] tabular-nums">{i + 1}</span>
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
