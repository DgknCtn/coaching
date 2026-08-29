'use client'

import { useState, useTransition } from 'react'
import { formatUnitCount } from '@/lib/unit-labels'
import { CheckCircle2, RotateCcw, Loader2, Undo2, ChevronDown, ChevronRight } from 'lucide-react'
import {
  submitHomeworkItemAction,
  revertCompletedAction,
  submitHomeworkBatchAction,
} from './actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  deriveTestState,
  testStateLabel,
  TEST_STATE_VARIANT,
  type HomeworkTestState,
  todayDateString,
} from '@/lib/homework-status'

interface HomeworkItem {
  id: string
  status: string
  completed_at: string | null
  teacher_note: string | null
  rejected_at: string | null
  submitted_at: string | null
  book_id: string | null
  books: { title: string; subject: string; tracking_mode?: string | null } | null
  book_sections: { title: string } | null
  book_tests: { title: string } | null
}

interface HomeworkBatch {
  id: string
  title: string | null
  /** Ödev notu (R6-05). homework_batches.description alanı. */
  description: string | null
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
      {batches.map(batch => (
        <BatchCard key={batch.id} batch={batch} />
      ))}
    </div>
  )
}

function BatchCard({ batch }: { batch: HomeworkBatch }) {
  const [isPending, startTransition] = useTransition()
  const items = (batch.homework_items ?? []).filter(i => i.status !== 'cancelled')
  const states = items.map(i => stateOf(i, batch.due_date))

  // Grup rozeti tek aktif durumdan türetilir. Öğrenci gecikmiş bir çalışmayı
  // onaya gönderdiğinde grup artık "Süresi Geçen" değil "Onay Bekliyor"
  // gösterir (R2 Ek Revizyon §2).
  const batchState: HomeworkTestState | null = states.includes('overdue')
    ? 'overdue'
    : states.includes('returned')
      ? 'returned'
      : states.includes('pending_approval')
        ? 'pending_approval'
        : null

  const pendingCount = items.filter(i => i.status === 'pending').length

  // Kitap grupları: 100 testlik haftada öğrenci grup bazında gönderir,
  // gerekirse grubu açıp tek tek düzeltir (R3 v2 §3).
  const bookGroups = new Map<
    string,
    {
      bookId: string | null
      title: string
      trackingMode: string
      items: HomeworkItem[]
    }
  >()
  for (const item of items) {
    const key = item.book_id ?? item.books?.title ?? '—'
    const group = bookGroups.get(key) ?? {
      bookId: item.book_id,
      title: item.books?.title ?? 'Kitap',
      trackingMode: item.books?.tracking_mode ?? 'test',
      items: [],
    }
    group.items.push(item)
    bookGroups.set(key, group)
  }
  const groups = [...bookGroups.values()]

  // R5.1: çalışmanın gerçekten yapıldığı gün. Varsayılan bugün; öğrenci
  // geriye dönük bir gün seçebilir ("dün çalıştım, bugün işaretliyorum").
  // Bu tarih onay anında test_completions.studied_on'a taşınır ve Koruma
  // Havuzu'nun "son temas" hesabının kaynağı olur — onay tarihi değil.
  const [studiedOn, setStudiedOn] = useState(todayDateString())

  function submitAll(bookId?: string) {
    startTransition(async () => {
      await submitHomeworkBatchAction(batch.id, bookId, studiedOn)
    })
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Teslim: {new Date(batch.due_date).toLocaleDateString('tr-TR')}
          </span>
          {pendingCount > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="hidden sm:inline">Çalıştığım gün</span>
              <input
                type="date"
                value={studiedOn}
                max={todayDateString()}
                onChange={e => setStudiedOn(e.target.value)}
                className="h-7 rounded-md border border-input bg-card px-2 text-xs outline-none focus-visible:border-ring"
              />
            </label>
          )}
          {pendingCount > 1 && (
            <Button size="xs" disabled={isPending} onClick={() => submitAll()}>
              {isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Tümünü gönder ({pendingCount})
            </Button>
          )}
        </div>
      </div>

      {/* Ödev notu (R6-05). Boşsa hiçbir başlık/kutu gösterilmez. */}
      {batch.description?.trim() && (
        <p className="border-b bg-muted/30 px-4 py-2.5 text-sm">
          <span className="font-medium">Not: </span>
          <span className="text-muted-foreground">{batch.description.trim()}</span>
        </p>
      )}

      <div className="divide-y">
        {groups.map(group => (
          <BookGroup
            key={group.bookId ?? group.title}
            group={group}
            dueDate={batch.due_date}
            multipleBooks={groups.length > 1}
            onSubmitGroup={() => submitAll(group.bookId ?? undefined)}
            groupPending={isPending}
            studiedOn={studiedOn}
          />
        ))}
      </div>
    </div>
  )
}

function BookGroup({
  group,
  dueDate,
  multipleBooks,
  onSubmitGroup,
  groupPending,
  studiedOn,
}: {
  group: {
    bookId: string | null
    title: string
    trackingMode: string
    items: HomeworkItem[]
  }
  dueDate: string
  multipleBooks: boolean
  onSubmitGroup: () => void
  groupPending: boolean
  studiedOn: string
}) {
  // Tek kitaplı ödevde ekstra bir katman göstermenin anlamı yok.
  const [expanded, setExpanded] = useState(!multipleBooks)
  const pendingCount = group.items.filter(i => i.status === 'pending').length

  if (!multipleBooks) {
    return (
      <div className="divide-y">
        {group.items.map(item => (
          <HomeworkItemRow key={item.id} item={item} dueDate={dueDate} studiedOn={studiedOn} />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 bg-muted/30 px-4 py-2">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-xs font-medium">{group.title}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatUnitCount(group.items.length, group.trackingMode)}
          </span>
        </button>
        {pendingCount > 0 && (
          <Button size="xs" variant="outline" disabled={groupPending} onClick={onSubmitGroup}>
            {groupPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Tümünü gönder
          </Button>
        )}
      </div>
      {expanded && (
        <div className="divide-y">
          {group.items.map(item => (
            <HomeworkItemRow key={item.id} item={item} dueDate={dueDate} studiedOn={studiedOn} />
          ))}
        </div>
      )}
    </div>
  )
}

function HomeworkItemRow({
  item,
  dueDate,
  studiedOn,
}: {
  item: HomeworkItem
  dueDate: string
  /** Grup başlığında seçilen "çalıştığım gün" (R5.1). */
  studiedOn: string
}) {
  const [isPending, startTransition] = useTransition()
  const state = stateOf(item, dueDate)
  const isDone = state === 'completed' || state === 'pending_approval'
  const isReturned = state === 'returned'

  function toggle() {
    startTransition(async () => {
      if (isDone) {
        await revertCompletedAction(item.id)
      } else {
        await submitHomeworkItemAction(item.id, studiedOn)
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
