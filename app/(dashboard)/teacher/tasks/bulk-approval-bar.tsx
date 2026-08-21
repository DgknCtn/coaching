'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { approveHomeworkBatchAction } from './actions'
import { Button } from '@/components/ui/button'

// Toplu onay şeridi (R3 v2 §E). Aşağıdaki ayrıntılı tablo olduğu gibi kalır —
// eğitmen isterse tek testte onay/red vermeye devam eder. Bu şerit yalnız
// "100 test için 100 tıklama" yükünü kaldırır.

export interface ApprovalGroup {
  key: string
  batchId: string
  bookId: string | null
  studentName: string
  bookTitle: string
  count: number
}

export function BulkApprovalBar({ groups }: { groups: ApprovalGroup[] }) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const visible = groups.filter(g => g.count > 1 && !done.has(g.key))

  if (visible.length === 0) return null

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">
        Kitap/ödev grubu bazında toplu onay. Tek tek onay/red için aşağıdaki listeyi kullanın.
      </p>
      <div className="flex flex-wrap gap-2">
        {visible.map(group => (
          <GroupButton
            key={group.key}
            group={group}
            onDone={() => setDone(prev => new Set(prev).add(group.key))}
          />
        ))}
      </div>
    </div>
  )
}

function GroupButton({ group, onDone }: { group: ApprovalGroup; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()

  function approveAll() {
    startTransition(async () => {
      const result = await approveHomeworkBatchAction(group.batchId, group.bookId ?? undefined)
      if (result.error) {
        toast.error(result.error)
        return
      }
      onDone()
      toast.success(`${group.studentName} · ${group.bookTitle}: ${group.count} test onaylandı.`)
    })
  }

  return (
    <Button size="xs" variant="outline" disabled={isPending} onClick={approveAll}>
      {isPending ? <Loader2 className="animate-spin" /> : <Check />}
      <span className="truncate">
        {group.studentName} · {group.bookTitle}
      </span>
      <span className="tabular-nums text-muted-foreground">({group.count})</span>
    </Button>
  )
}
