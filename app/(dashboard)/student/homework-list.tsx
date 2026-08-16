'use client'

import { useTransition } from 'react'
import { CheckCircle2, RotateCcw, Loader2 } from 'lucide-react'
import { submitHomeworkItemAction, revertCompletedAction } from './actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface HomeworkItem {
  id: string
  status: string
  completed_at: string | null
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

export function HomeworkList({ batches }: { batches: HomeworkBatch[] }) {
  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-3">
      {batches.map(batch => {
        const items = batch.homework_items ?? []
        const isOverdue = batch.due_date < todayStr
        const allDone = items.every(i => i.status === 'completed' || i.status === 'cancelled')
        return (
          <div
            key={batch.id}
            className="overflow-hidden rounded-lg border bg-card"
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {batch.title ?? new Date(batch.due_date).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
                {isOverdue && !allDone && <Badge variant="warning">Gecikmiş</Badge>}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                Teslim: {new Date(batch.due_date).toLocaleDateString('tr-TR')}
              </span>
            </div>
            <div className="divide-y">
              {items.map(item => (
                item.status !== 'cancelled' && <HomeworkItemRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HomeworkItemRow({ item }: { item: HomeworkItem }) {
  const [isPending, startTransition] = useTransition()
  const isCompleted = item.status === 'completed'
  const isPendingApproval = item.status === 'pending_approval'
  const isDone = isCompleted || isPendingApproval

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
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', isDone && 'text-muted-foreground line-through')}>
          {item.book_tests?.title ?? ''}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {item.books?.title ?? ''} · {item.book_sections?.title ?? ''}
        </p>
        {isPendingApproval && (
          <Badge variant="info" className="mt-2">
            Onay bekliyor
          </Badge>
        )}
      </div>
      <Button
        size="sm"
        variant={isDone ? 'outline' : 'default'}
        disabled={isPending}
        onClick={toggle}
      >
        {isPending ? (
          <Loader2 className="animate-spin" />
        ) : isDone ? (
          <><RotateCcw /> Geri Al</>
        ) : (
          <><CheckCircle2 /> Onaya Gönder</>
        )}
      </Button>
    </div>
  )
}
