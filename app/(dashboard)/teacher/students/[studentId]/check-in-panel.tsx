'use client'

import { useState, useTransition } from 'react'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { saveCheckInScheduleAction } from './check-in-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  studentId: string
  intervalDays: number
  isActive: boolean
}

export function CheckInScheduleForm({ studentId, intervalDays, isActive }: Props) {
  const [days, setDays] = useState(String(intervalDays))
  const [active, setActive] = useState(isActive)
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const result = await saveCheckInScheduleAction(studentId, Number(days), active)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Durum bildirimi planı kaydedildi.')
    })
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm font-medium">Bildirim planı</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Öğrenciden kaç günde bir durum bildirimi istensin? Süresi geçen ve 24 saat
        içinde cevaplanmayan bildirim dashboard&apos;da dikkatine düşer.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div className="w-32">
          <Label htmlFor="interval-days">Periyot (gün)</Label>
          <Input
            id="interval-days"
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Aktif
        </label>

        <Button size="sm" className="mb-1" disabled={isPending} onClick={save}>
          {isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Kaydet
        </Button>
      </div>
    </div>
  )
}
