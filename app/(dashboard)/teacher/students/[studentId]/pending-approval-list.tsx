'use client'

import { useState, useTransition } from 'react'
import { Check, X, Loader2, Clock3, ChevronDown, ChevronRight } from 'lucide-react'
import {
  approveHomeworkItemAction,
  rejectHomeworkItemAction,
  approveHomeworkBatchAction,
} from './homework-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface PendingItem {
  id: string
  book_id: string | null
  homework_batch_id: string
  book_tests: { title: string } | null
  books: { title: string } | null
  book_sections: { title: string } | null
}

interface Group {
  key: string
  batchId: string
  bookId: string | null
  bookTitle: string
  items: PendingItem[]
}

export function PendingApprovalList({
  studentId,
  items,
}: {
  studentId: string
  items: PendingItem[]
}) {
  if (!items.length) return null

  // Ödev + kitap grubu bazında topla: eğitmen 100 test için 100 ayrı onay
  // tıklamak zorunda kalmasın (R3 v2 §3/§E).
  const groupMap = new Map<string, Group>()
  for (const item of items) {
    const key = `${item.homework_batch_id}:${item.book_id ?? '-'}`
    const group = groupMap.get(key) ?? {
      key,
      batchId: item.homework_batch_id,
      bookId: item.book_id,
      bookTitle: item.books?.title ?? 'Kitap',
      items: [],
    }
    group.items.push(item)
    groupMap.set(key, group)
  }
  const groups = [...groupMap.values()]

  return (
    <div className="overflow-hidden rounded-lg border border-info-border bg-info-subtle">
      <div className="flex items-center gap-2 border-b border-info-border px-4 py-3">
        <Clock3 className="size-3.5 text-info" />
        <span className="text-sm font-medium text-foreground">
          Onay bekleyenler ({items.length})
        </span>
      </div>
      <div className="divide-y divide-info-border">
        {groups.map(group => (
          <PendingGroup key={group.key} studentId={studentId} group={group} />
        ))}
      </div>
    </div>
  )
}

function PendingGroup({ studentId, group }: { studentId: string; group: Group }) {
  const [isPending, startTransition] = useTransition()
  // Tek testlik grupta katman göstermenin anlamı yok.
  const [expanded, setExpanded] = useState(group.items.length <= 3)

  function approveAll() {
    startTransition(async () => {
      await approveHomeworkBatchAction(group.batchId, studentId, group.bookId ?? undefined)
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2">
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
          <span className="truncate text-xs font-medium">{group.bookTitle}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {group.items.length} test
          </span>
        </button>
        {group.items.length > 1 && (
          <Button size="xs" disabled={isPending} onClick={approveAll} className="gap-1">
            {isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            Tümünü onayla
          </Button>
        )}
      </div>

      {expanded && (
        <div className="divide-y divide-info-border">
          {group.items.map(item => (
            <PendingItemRow key={item.id} studentId={studentId} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function PendingItemRow({ studentId, item }: { studentId: string; item: PendingItem }) {
  const [isPending, startTransition] = useTransition()
  const [showReject, setShowReject] = useState(false)
  const [note, setNote] = useState('')

  function approve() {
    startTransition(async () => {
      await approveHomeworkItemAction(item.id, studentId)
    })
  }

  function reject() {
    startTransition(async () => {
      await rejectHomeworkItemAction(item.id, studentId, note || undefined)
      setShowReject(false)
      setNote('')
    })
  }

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{item.book_tests?.title ?? ''}</p>
          <p className="truncate text-xs text-muted-foreground">
            {item.books?.title ?? ''} · {item.book_sections?.title ?? ''}
          </p>
        </div>
        <Button size="sm" disabled={isPending} onClick={approve} className="gap-1">
          {isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Onayla
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => setShowReject(v => !v)}
          className="gap-1 text-muted-foreground"
        >
          <X className="size-3" /> Reddet
        </Button>
      </div>
      {showReject && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Red gerekçesi (isteğe bağlı)"
            className="flex-1"
          />
          <Button size="sm" variant="destructive" disabled={isPending} onClick={reject}>
            Gönder
          </Button>
        </div>
      )}
    </div>
  )
}
