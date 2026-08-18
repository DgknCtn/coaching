'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { approveFromTasksAction, rejectFromTasksAction } from './actions'
import { Button } from '@/components/ui/button'

export function ApprovalActions({ homeworkItemId }: { homeworkItemId: string }) {
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)

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
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => run(() => rejectFromTasksAction(homeworkItemId), 'Reddedildi, öğrenci tekrar gönderebilir.')}
      >
        {isPending ? <Loader2 className="animate-spin" /> : <X />}
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
  )
}
