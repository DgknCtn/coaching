'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { parseQuickTask, type AcademicTask } from '@/lib/academic-tasks'
import { courseKey } from '@/lib/academic-paste'
import type { HaftamCard, HaftamDay } from '@/lib/haftam'
import { WorkCard } from './work-card'
import { TaskCard, TASK_DRAG_TYPE } from './task-card'
import { addOwnTaskAction, setPlanDatesAction, setTaskPlanDateAction } from './actions'

// BU HAFTANIN HAVUZU (M1.0-03 §7).
//
// Plan yayınlanınca kitap ve akademik çalışmalar ÖNCE buraya düşer;
// öğrenci haftasına kendisi yerleştirir. Eski "Planlanmamışlar" şeridi
// bu havuza dönüştü ve sayfanın ÜSTÜNE çıktı: haftanın planı buradan
// başlıyor. Sistem kendiliğinden dağıtmaz (R7-06 kabulü aynen).
//
// Havuz da bir bırakma hedefidir: güne konmuş bir çalışma geri
// sürüklenirse yeniden havuza döner.

export function WeekPool({
  cards,
  tasks,
  days,
  today,
  currentFlowId,
  courses,
}: {
  cards: HaftamCard[]
  tasks: AcademicTask[]
  days: HaftamDay[]
  today: string
  currentFlowId: string
  /** Öğrencinin aktif dersleri — kendi çalışmasını eklerken eşleşir. */
  courses: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [isDragOver, setDragOver] = useState(false)
  const [, startTransition] = useTransition()
  const open = tasks.filter((t) => t.status !== 'done')
  const total = cards.length + open.length

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragOver(false)
    const taskId = event.dataTransfer.getData(TASK_DRAG_TYPE)
    const raw = event.dataTransfer.getData('application/x-haftam-items')
    startTransition(async () => {
      let res: { error?: string } | undefined
      if (taskId) res = await setTaskPlanDateAction(taskId, null)
      else if (raw) {
        try {
          res = await setPlanDatesAction(JSON.parse(raw) as string[], null)
        } catch {
          return
        }
      } else return
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success('Havuza geri alındı.')
      router.refresh()
    })
  }

  return (
    <section
      id="planlanmamislar"
      aria-label="Bu haftanın havuzu"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        'scroll-mt-4 rounded-lg border bg-card p-4 transition-colors',
        isDragOver && 'border-primary bg-primary/5'
      )}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Bu Haftanın Havuzu</h2>
        <Badge variant="neutral">{total}</Badge>
        <p className="text-xs text-muted-foreground">
          Henüz bir güne koymadığın çalışmalar. Güne sürükle ya da gün seç; teslim tarihi değişmez.
        </p>
      </div>

      <OwnTaskInput courses={courses} />

      {total === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Havuz boş — haftanın tüm çalışmaları günlere yerleşti.</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {open.map((t) => (
            <TaskCard key={t.id} task={t} days={days} today={today} currentFlowId={currentFlowId} />
          ))}
          {cards.map((card) => (
            <WorkCard key={card.key} card={card} days={days} />
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * "[+ Çalışma ekle…]" — tek satır. Metinde ders adı geçiyorsa ya da tek
 * ders varsa otomatik eşlenir; birden fazla eşleşme varsa yalnız ders
 * seçimi sorulur (§8).
 */
function OwnTaskInput({ courses }: { courses: { id: string; name: string }[] }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [scopeId, setScopeId] = useState('')
  const [isPending, startTransition] = useTransition()

  if (courses.length === 0) return null

  const key = courseKey(text)
  const matches = courses.filter((c) => {
    const k = courseKey(c.name)
    const subject = k.split(' ').slice(-1)[0]
    return key.includes(k) || (subject.length > 3 && key.includes(subject))
  })
  const auto = courses.length === 1 ? courses[0] : matches.length === 1 ? matches[0] : null
  const chosen = scopeId || auto?.id || ''

  function submit() {
    const q = parseQuickTask(text)
    if (!q) return
    if (!chosen) {
      toast.error('Hangi ders için? Ders seçin.')
      return
    }
    startTransition(async () => {
      const r = await addOwnTaskAction({
        scopeId: chosen,
        kind: q.kind,
        title: q.title,
        targetMinutes: q.targetMinutes,
        checklist: q.checklist,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success('Havuza eklendi.')
      setText('')
      setScopeId('')
      router.refresh()
    })
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="relative min-w-56 flex-1">
        <Plus className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          disabled={isPending}
          onChange={(e) => setText(e.target.value)}
          placeholder="Çalışma ekle… (ör. coğrafya okul notlarını tekrar et)"
          aria-label="Kendi çalışmanı ekle"
          className="h-8 pl-7 text-sm"
        />
      </div>
      {text.trim() && !auto && (
        <NativeSelect
          aria-label="Ders"
          value={scopeId}
          onChange={(e) => setScopeId(e.target.value)}
          className="h-8 w-48 text-sm"
        >
          <option value="">Ders seç…</option>
          {(matches.length > 1 ? matches : courses).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      )}
      {text.trim() && auto && <span className="text-xs text-muted-foreground">{auto.name}</span>}
      <Button size="sm" type="submit" disabled={isPending || !text.trim()}>
        Ekle
      </Button>
    </form>
  )
}
