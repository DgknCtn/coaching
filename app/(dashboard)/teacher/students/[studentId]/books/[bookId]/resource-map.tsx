'use client'

import { useCallback, useState } from 'react'
import { Eye, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import type { BookMapBook } from '@/lib/book-map'
import { isSelectableState, type BookMapMode } from '@/lib/book-map'
import { BookMapGrid, BookMapLegend } from '@/components/shared/book-map-grid'
import { BulkActionPanel } from '@/components/shared/bulk-action-panel'
import { unitLabel } from '@/lib/unit-labels'
import { cn } from '@/lib/utils'
import {
  approveUnitsAction,
  completeUnitsManuallyAction,
  revertUnitsAction,
} from './map-actions'

// Kaynak Haritası — eğitmenin ana çalışma yüzeyi (R6-03).
//
// İki mod:
//   Görünüm — salt okunur, bugünkü davranış. Sayfa açıldığında varsayılan.
//   Yönetim — altı durum da seçilebilir; toplu tamamlandı işleme, onaylama
//             ve tamamlanmayı geri alma.
//
// "Bu Haftanın Planı" sepeti bu ekranda DEĞİL, ödev verme ekranındadır ve bu
// özellik ona hiç dokunmaz (kabul testi #30). İki seçim amacı bilinçli olarak
// ayrı yüzeylerde durur.

interface Props {
  studentId: string
  book: BookMapBook
}

const MODES: { key: BookMapMode | 'view'; label: string; icon: typeof Eye }[] = [
  { key: 'view', label: 'Görünüm', icon: Eye },
  { key: 'manage', label: 'Yönetim', icon: SlidersHorizontal },
]

export function ResourceMap({ studentId, book }: Props) {
  const [mode, setMode] = useState<BookMapMode | 'view'>('view')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const manage = mode === 'manage'

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  function switchMode(next: BookMapMode | 'view') {
    setMode(next)
    // Mod değişince seçim taşınmaz: görünüm modunda seçim kavramı yoktur ve
    // yönetime dönerken eski seçimle işlem yapılması sürpriz olurdu.
    clearSelection()
  }

  const toggleTest = useCallback(
    (_bookId: string, testId: string) => {
      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(testId)) next.delete(testId)
        else next.add(testId)
        return next
      })
    },
    []
  )

  // Bölüm başlığı / durum çipi: hepsi zaten seçiliyse kaldırır, değilse ekler.
  const toggleSection = useCallback((_bookId: string, testIds: string[]) => {
    if (testIds.length === 0) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allSelected = testIds.every(id => next.has(id))
      for (const id of testIds) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }, [])

  // Shift+tık: son tıklanandan buraya kadar, yalnız bu kitabın seçilebilir
  // birimleri. Bölüm sırası harita sırasıyla aynıdır.
  const [lastClicked, setLastClicked] = useState<string | null>(null)
  const selectRange = useCallback(
    (_bookId: string, testId: string) => {
      if (!lastClicked) {
        toggleTest(_bookId, testId)
        setLastClicked(testId)
        return
      }
      const flat = book.sections.flatMap(s => s.tests)
      const from = flat.findIndex(t => t.id === lastClicked)
      const to = flat.findIndex(t => t.id === testId)
      if (from === -1 || to === -1) return
      const [start, end] = from <= to ? [from, to] : [to, from]
      const ids = flat
        .slice(start, end + 1)
        .filter(t => isSelectableState(t.state, 'manage'))
        .map(t => t.id)
      setSelectedIds(prev => {
        const next = new Set(prev)
        for (const id of ids) next.add(id)
        return next
      })
      setLastClicked(testId)
    },
    [book, lastClicked, toggleTest]
  )

  const unit = unitLabel(book.trackingMode)

  function report(verb: string) {
    return (result: { error?: string; success?: boolean; result?: Record<string, number> }) => {
      if (result.error) toast.error(result.error)
      else toast.success(`Seçili ${unit} ${verb}.`)
      return result
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          {MODES.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => switchMode(item.key)}
              aria-pressed={mode === item.key}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                mode === item.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <item.icon className="size-3.5" />
              {item.label}
            </button>
          ))}
        </div>
        <BookMapLegend audience="teacher" />
      </div>

      {manage && (
        <p className="text-xs text-muted-foreground">
          Çalışmaları seçmek durumlarını değiştirmez. Değişiklik yalnız aşağıdaki
          panelden bir işlem uyguladığınızda gerçekleşir.
        </p>
      )}

      <BookMapGrid
        book={book}
        audience="teacher"
        readOnly={!manage}
        mode={manage ? 'manage' : 'plan'}
        selectedTestIds={selectedIds}
        onToggleTest={toggleTest}
        onToggleSection={toggleSection}
        onSelectRange={selectRange}
      />

      {manage && (
        <BulkActionPanel
          book={book}
          selectedIds={selectedIds}
          onClearSelection={clearSelection}
          onComplete={ids =>
            completeUnitsManuallyAction(studentId, book.bookId, {
              assignmentId: book.assignmentId,
              unitIds: ids,
            }).then(report('tamamlandı olarak işlendi'))
          }
          onApprove={ids =>
            approveUnitsAction(studentId, book.bookId, {
              assignmentId: book.assignmentId,
              unitIds: ids,
            }).then(report('onaylandı'))
          }
          onRevert={ids =>
            revertUnitsAction(studentId, book.bookId, {
              assignmentId: book.assignmentId,
              unitIds: ids,
            }).then(report('tamamlanma kaydı geri alındı'))
          }
        />
      )}
    </div>
  )
}
