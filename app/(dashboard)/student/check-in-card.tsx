'use client'

import { useState, useTransition } from 'react'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { submitCheckInAction } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const MOODS = [
  { value: 'iyi', label: 'İyi gidiyor' },
  { value: 'idare_eder', label: 'İdare eder' },
  { value: 'zorlaniyorum', label: 'Zorlanıyorum' },
] as const

export function CheckInCard({ checkInId }: { checkInId: string }) {
  const [mood, setMood] = useState<string>('iyi')
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const result = await submitCheckInAction(checkInId, mood, message)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Durum bildirimin gönderildi.')
    })
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-medium">Durum bildirimi</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Öğretmenin nasıl gittiğini merak ediyor. Kısaca anlat.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMood(m.value)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm transition-colors',
              mood === m.value
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <Textarea
        className="mt-3"
        rows={3}
        maxLength={500}
        placeholder="Eklemek istediğin bir şey var mı? (isteğe bağlı)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <div className="mt-3 flex justify-end">
        <Button size="sm" disabled={isPending} onClick={submit}>
          {isPending ? <Loader2 className="animate-spin" /> : <Send />}
          Gönder
        </Button>
      </div>
    </div>
  )
}
