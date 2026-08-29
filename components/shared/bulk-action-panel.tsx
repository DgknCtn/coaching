'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, CheckCheck, Loader2, Undo2, X } from 'lucide-react'
import type { BookMapBook } from '@/lib/book-map'
import { formatSelectedUnits } from '@/lib/book-map'
import {
  countApplicable,
  filterApplicable,
  revertConfirmMessage,
  type BulkAction,
} from '@/lib/bulk-actions'
import type { HomeworkTestState } from '@/lib/homework-status'
import { unitLabel } from '@/lib/unit-labels'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Kaynak Haritası toplu işlem paneli (R6-03 §10).
//
// Panelin tek işi seçimi ŞEFFAF kılmak: hangi bölümlerden ne seçildi ve
// hangi işlem kaç öğeye uygulanabilir. Sayımların tamamı lib/bulk-actions.ts
// içindeki saf fonksiyonlardan gelir; bu dosya kendi kuralını kurmaz.
//
// Seçim TEK BAŞINA hiçbir statüyü değiştirmez — değişiklik yalnız buradaki
// bir düğmeye basıldığında olur.

export interface BulkActionPanelProps {
  book: BookMapBook
  selectedIds: Set<string>
  onClearSelection: () => void
  onComplete: (unitIds: string[]) => Promise<{ error?: string; success?: boolean }>
  onApprove: (unitIds: string[]) => Promise<{ error?: string; success?: boolean }>
  onRevert: (unitIds: string[]) => Promise<{ error?: string; success?: boolean }>
  className?: string
}

interface SelectedUnit {
  id: string
  state: HomeworkTestState
  orderIndex: number
  sectionId: string
  sectionTitle: string
}

export function BulkActionPanel({
  book,
  selectedIds,
  onClearSelection,
  onComplete,
  onApprove,
  onRevert,
  className,
}: BulkActionPanelProps) {
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  const units = useMemo<SelectedUnit[]>(() => {
    const out: SelectedUnit[] = []
    for (const section of book.sections) {
      for (const test of section.tests) {
        if (!selectedIds.has(test.id)) continue
        out.push({
          id: test.id,
          state: test.state,
          orderIndex: test.orderIndex,
          sectionId: section.id,
          sectionTitle: section.title,
        })
      }
    }
    return out
  }, [book, selectedIds])

  const counts = useMemo(() => countApplicable(units.map(u => u.state)), [units])

  // Seçim bağlamı bölüm bölüm gösterilir (§7). Sayfa kaynağında bu şarttır:
  // "24 sayfa seçildi" tek başına hangi fasikülden olduğunu söylemez.
  const contextRows = useMemo(() => {
    const bySection = new Map<string, { title: string; orderIndexes: number[] }>()
    for (const unit of units) {
      const row = bySection.get(unit.sectionId) ?? { title: unit.sectionTitle, orderIndexes: [] }
      row.orderIndexes.push(unit.orderIndex)
      bySection.set(unit.sectionId, row)
    }
    return [...bySection.values()]
  }, [units])

  if (units.length === 0) return null

  function run(action: BulkAction) {
    const ids = filterApplicable(action, units)
    if (ids.length === 0) return

    if (action === 'revert' && !window.confirm(revertConfirmMessage(ids.length))) return

    const handler = action === 'complete' ? onComplete : action === 'approve' ? onApprove : onRevert

    setPendingAction(action)
    setMessage(null)
    startTransition(async () => {
      const result = await handler(ids)
      setPendingAction(null)
      if (result.error) {
        setMessage(result.error)
        return
      }
      onClearSelection()
    })
  }

  const unit = unitLabel(book.trackingMode)

  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 space-y-3 rounded-xl border bg-card p-4 shadow-lg',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium tabular-nums">
            {counts.selected} {unit} seçildi
          </p>
          <ul className="mt-1 space-y-0.5">
            {contextRows.map(row => (
              <li key={row.title} className="flex gap-1.5 text-xs text-muted-foreground">
                <span className="truncate">{row.title}</span>
                <span className="shrink-0 tabular-nums">
                  → {formatSelectedUnits(row.orderIndexes, book.trackingMode)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <Button
          size="xs"
          variant="ghost"
          onClick={onClearSelection}
          disabled={isPending}
          className="shrink-0"
        >
          <X className="size-3.5" />
          Seçimi temizle
        </Button>
      </div>

      {message && <p className="text-xs text-destructive">{message}</p>}

      {/* Her düğme kaç öğeye uygulanacağını kendi üstünde söyler; eğitmen
          karma seçimde ne olacağını tahmin etmek zorunda kalmaz. */}
      <div className="flex flex-wrap gap-2">
        <ActionButton
          label="Tamamlandı Olarak İşle"
          icon={Check}
          count={counts.complete}
          busy={isPending && pendingAction === 'complete'}
          disabled={isPending}
          onClick={() => run('complete')}
        />
        <ActionButton
          label="Onayla"
          icon={CheckCheck}
          count={counts.approve}
          busy={isPending && pendingAction === 'approve'}
          disabled={isPending}
          onClick={() => run('approve')}
          variant="outline"
        />
        <ActionButton
          label="Tamamlanmayı Geri Al"
          icon={Undo2}
          count={counts.revert}
          busy={isPending && pendingAction === 'revert'}
          disabled={isPending}
          onClick={() => run('revert')}
          variant="outline"
        />
      </div>
    </div>
  )
}

function ActionButton({
  label,
  icon: Icon,
  count,
  busy,
  disabled,
  onClick,
  variant = 'default',
}: {
  label: string
  icon: typeof Check
  count: number
  busy: boolean
  disabled: boolean
  onClick: () => void
  variant?: 'default' | 'outline'
}) {
  return (
    <Button
      size="sm"
      variant={variant}
      onClick={onClick}
      disabled={disabled || count === 0}
      title={count === 0 ? 'Seçimde bu işleme uygun çalışma yok' : undefined}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {label} <span className="tabular-nums">({count})</span>
    </Button>
  )
}
