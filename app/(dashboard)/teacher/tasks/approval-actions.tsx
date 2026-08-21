'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { approveFromTasksAction, rejectFromTasksAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ApprovalActions({ homeworkItemId }: { homeworkItemId: string }) {
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  // Red gerekçesi öğrenciye "İade Edildi" notu olarak gösterildiği için bu
  // yol da not alabilmeli; aksi halde buradan reddedilen her çalışmanın
  // gerekçesi null kalıyordu (R2 Ek Revizyon §3).
  const [showReject, setShowReject] = useState(false)
  const [note, setNote] = useState('')

  function run(fn: () => Promise<{ error?: string; success?: boolean }>, okMessage: string) {
    startTransition(async () => {
      const result = await fn()
      if (result.error) {
        toast.error(result.error)
        return
      }
      setDone(true)
      toast.success(okMessage)
    })
  }

  if (done) {
    return <span className="text-xs text-muted-foreground">İşlendi</span>
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => setShowReject(v => !v)}
        >
          <X />
          Reddet
        </Button>
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => run(() => approveFromTasksAction(homeworkItemId), 'Onaylandı.')}
        >
          {isPending ? <Loader2 className="animate-spin" /> : <Check />}
          Onayla
        </Button>
      </div>

      {showReject && (
        <div className="flex items-center justify-end gap-2">
          <Input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Red gerekçesi (isteğe bağlı)"
            className="max-w-xs"
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              run(
                () => rejectFromTasksAction(homeworkItemId, note || undefined),
                'Reddedildi, öğrenci tekrar gönderebilir.'
              )
            }
          >
            {isPending ? <Loader2 className="animate-spin" /> : null}
            Gönder
          </Button>
        </div>
      )}
    </div>
  )
}
