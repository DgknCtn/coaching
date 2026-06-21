'use client'

import { useTransition } from 'react'
import { CheckCircle2, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react'
import { markCompletedAction, revertCompletedAction } from './actions'
import { Button } from '@/components/ui/button'
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
            className={cn(
              'rounded-xl border bg-card',
              isOverdue && !allDone && 'border-red-200'
            )}
          >
            <div className={cn('flex items-center justify-between px-4 py-2.5 border-b', isOverdue && !allDone ? 'bg-red-50' : 'bg-muted/40')}>
              <div className="flex items-center gap-2">
                {isOverdue && !allDone && <AlertTriangle className="size-3.5 text-red-500" />}
                <span className="text-sm font-medium">
                  {batch.title ?? new Date(batch.due_date).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
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

  function toggle() {
    startTransition(async () => {
      if (isCompleted) {
        await revertCompletedAction(item.id)
      } else {
        await markCompletedAction(item.id)
      }
    })
  }

  return (
    <div className={cn('flex items-center gap-3 px-4 py-2.5', isCompleted && 'bg-muted/20')}>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm', isCompleted && 'line-through text-muted-foreground')}>
          {item.book_tests?.title ?? ''}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {item.books?.title ?? ''} · {item.book_sections?.title ?? ''}
        </p>
      </div>
      <Button
        size="xs"
        variant={isCompleted ? 'outline' : 'default'}
        disabled={isPending}
        onClick={toggle}
        className={isCompleted ? 'text-muted-foreground' : ''}
      >
        {isPending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : isCompleted ? (
          <><RotateCcw className="size-3" /> Geri Al</>
        ) : (
          <><CheckCircle2 className="size-3" /> Tamamladım</>
        )}
      </Button>
    </div>
  )
}
