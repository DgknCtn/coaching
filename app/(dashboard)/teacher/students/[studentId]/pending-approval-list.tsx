'use client'

import { useState, useTransition } from 'react'
import { Check, X, Loader2, Clock3 } from 'lucide-react'
import { approveHomeworkItemAction, rejectHomeworkItemAction } from './homework-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface PendingItem {
  id: string
  book_tests: { title: string } | null
  books: { title: string } | null
  book_sections: { title: string } | null
}

export function PendingApprovalList({ studentId, items }: { studentId: string; items: PendingItem[] }) {
  if (!items.length) return null

  return (
    <div className="overflow-hidden rounded-lg border border-info-border bg-info-subtle">
      <div className="flex items-center gap-2 border-b border-info-border px-4 py-3">
        <Clock3 className="size-3.5 text-info" />
        <span className="text-sm font-medium text-foreground">
          Onay bekleyenler ({items.length})
        </span>
      </div>
      <div className="divide-y divide-info-border">
        {items.map(item => (
          <PendingItemRow key={item.id} studentId={studentId} item={item} />
        ))}
      </div>
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
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{item.book_tests?.title ?? ''}</p>
          <p className="text-xs text-muted-foreground truncate">
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
