'use client'

import { useTransition } from 'react'
import { CheckCircle2, RotateCcw, Loader2, Undo2 } from 'lucide-react'
import { submitHomeworkItemAction, revertCompletedAction } from './actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  deriveTestState,
  testStateLabel,
  TEST_STATE_VARIANT,
  type HomeworkTestState,
} from '@/lib/homework-status'

interface HomeworkItem {
  id: string
  status: string
  completed_at: string | null
  teacher_note: string | null
  rejected_at: string | null
  submitted_at: string | null
  books: { title: string; subject: string } | null
  book_sections: { title: string } | null
  book_tests: { title: string } | null
}

interface HomeworkBatch {
  id: string
  title: string | null
  due_date: string
  status: string
  homework_items: HomeworkItem[]
}

type ItemStatus = Parameters<typeof deriveTestState>[0]['itemStatus']

function stateOf(item: HomeworkItem, dueDate: string): HomeworkTestState {
  return deriveTestState({
    itemStatus: item.status as ItemStatus,
    dueDate,
    rejectedAt: item.rejected_at,
  })
}

export function HomeworkList({ batches }: { batches: HomeworkBatch[] }) {
  return (
    <div className="space-y-3">
      {batches.map(batch => {
        const items = (batch.homework_items ?? []).filter(i => i.status !== 'cancelled')
        const states = items.map(i => stateOf(i, batch.due_date))

        // Grup rozeti tek aktif durumdan türetilir. Öğrenci gecikmiş bir
        // çalışmayı onaya gönderdiğinde grup artık "Süresi Geçen" değil
        // "Onay Bekliyor" gösterir (R2 Ek Revizyon §2).
        const batchState: HomeworkTestState | null = states.includes('overdue')
          ? 'overdue'
          : states.includes('returned')
            ? 'returned'
            : states.includes('pending_approval')
              ? 'pending_approval'
              : null

        return (
          <div key={batch.id} className="overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {batch.title ??
                    new Date(batch.due_date).toLocaleDateString('tr-TR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                </span>
                {batchState && (
                  <Badge variant={TEST_STATE_VARIANT[batchState]}>
                    {testStateLabel(batchState, 'student')}
                  </Badge>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                Teslim: {new Date(batch.due_date).toLocaleDateString('tr-TR')}
              </span>
            </div>
            <div className="divide-y">
              {items.map(item => (
                <HomeworkItemRow key={item.id} item={item} dueDate={batch.due_date} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HomeworkItemRow({ item, dueDate }: { item: HomeworkItem; dueDate: string }) {
  const [isPending, startTransition] = useTransition()
  const state = stateOf(item, dueDate)
  const isDone = state === 'completed' || state === 'pending_approval'
  const isReturned = state === 'returned'

  function toggle() {
    startTransition(async () => {
      if (isDone) {
        await revertCompletedAction(item.id)
      } else {
        await submitHomeworkItemAction(item.id)
      }
    })
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', isDone && 'text-muted-foreground line-through')}>
          {item.book_tests?.title ?? ''}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {item.books?.title ?? ''} · {item.book_sections?.title ?? ''}
        </p>

        {(state === 'pending_approval' || isReturned) && (
          <Badge variant={TEST_STATE_VARIANT[state]} className="mt-2">
            {testStateLabel(state, 'student')}
          </Badge>
        )}

        {/* Öğretmenin red gerekçesi (R2 Ek Revizyon §3). Yeniden gönderimde
            submit_homework_item_for_approval bu notu temizler. */}
        {isReturned && item.teacher_note && (
          <div className="mt-2 flex gap-2 rounded-md border border-warning-border bg-warning-subtle px-3 py-2">
            <Undo2 className="mt-0.5 size-3.5 shrink-0 text-warning-foreground" />
            <p className="text-xs text-warning-foreground">{item.teacher_note}</p>
          </div>
        )}
      </div>
      <Button
        size="sm"
        variant={isDone ? 'outline' : 'default'}
        disabled={isPending}
        onClick={toggle}
        className="shrink-0"
      >
        {isPending ? (
          <Loader2 className="animate-spin" />
        ) : isDone ? (
          <><RotateCcw /> Geri Al</>
        ) : (
          <><CheckCircle2 /> {isReturned ? 'Yeniden Gönder' : 'Onaya Gönder'}</>
        )}
      </Button>
    </div>
  )
}
