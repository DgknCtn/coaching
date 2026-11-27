'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { StudyTargets } from '@/lib/mistakes/load'
import { setStudyTargetsAction } from './actions'

// Günlük hedefler — öğrencinin "Bugün" kartındaki ilerleme çubukları
// bu sayılara göre dolar. 0 = hedef yok (çubuk gizlenir).

export function TargetsForm({ studentId, targets }: { studentId: string; targets: StudyTargets }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [q, setQ] = useState(String(targets.dailyQuestions))
  const [r, setR] = useState(String(targets.dailyReviews))

  function save() {
    startTransition(async () => {
      const res = await setStudyTargetsAction(studentId, { dailyQuestions: Number(q) || 0, dailyReviews: Number(r) || 0 })
      if (res.error) toast.error(res.error)
      else {
        toast.success('Hedefler kaydedildi.')
        router.refresh()
      }
    })
  }

  return (
    <div className="max-w-md space-y-4 rounded-lg border bg-card p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="t-q">Günlük soru hedefi</Label>
          <Input id="t-q" inputMode="numeric" value={q} onChange={e => setQ(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="t-r">Günlük tekrar hedefi</Label>
          <Input id="t-r" inputMode="numeric" value={r} onChange={e => setR(e.target.value.replace(/\D/g, ''))} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Öğrenci bu hedefleri ana sayfasındaki “Bugün” kartında görür. 0 yazarsanız hedef gösterilmez.</p>
      <Button size="sm" disabled={isPending} onClick={save}>
        {isPending && <Loader2 className="animate-spin" />}
        Kaydet
      </Button>
    </div>
  )
}
