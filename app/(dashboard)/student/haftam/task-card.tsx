'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import { taskProgressLabel, type AcademicTask } from '@/lib/academic-tasks'
import type { HaftamDay } from '@/lib/haftam'
import { WEEKDAY_SHORT_LABEL, type Weekday } from '@/lib/service-structure'
import { shortDate } from './day-column'
import {
  deleteOwnTaskAction,
  setTaskDoneAction,
  setTaskMinutesAction,
  setTaskPlanDateAction,
  toggleChecklistItemAction,
  updateOwnTaskAction,
} from './actions'

// AKADEMİK GÖREV KARTI (M1.0-03 §7-§8).
//
// Görev BÜTÜN olarak bir güne sürüklenir; V1'de parçalama yok. Güne
// koymak teslimi DEĞİŞTİRMEZ. Günü geçmiş açık görevde büyük "yeniden
// planlanmalı" metni yok — yalnız hafif renk farkı (§7).
//
// Tamamlanan görev kaybolmaz: aynı günün altına iner, soluklaşır,
// okunabilir kalır.

export const TASK_DRAG_TYPE = 'application/x-haftam-task'

export function TaskCard({
  task,
  days,
  today,
  currentFlowId,
}: {
  task: AcademicTask
  days: HaftamDay[]
  today: string
  currentFlowId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [minutes, setMinutes] = useState('')

  const done = task.status === 'done'
  const own = task.createdByRole === 'student'
  const inWindow = days.some((d) => d.date === task.plannedForDate)
  const missed = !done && inWindow && task.plannedForDate !== null && task.plannedForDate < today
  const fromEarlier = (task.originFlowId ?? task.weeklyFlowId) !== currentFlowId

  function run(action: () => Promise<{ error?: string }>, ok?: string) {
    startTransition(async () => {
      const r = await action()
      if (r?.error) {
        toast.error(r.error)
        return
      }
      if (ok) toast.success(ok)
      router.refresh()
    })
  }

  return (
    <div
      draggable={!done}
      onDragStart={(e) => {
        e.dataTransfer.setData(TASK_DRAG_TYPE, task.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'space-y-1.5 rounded-md border bg-card p-2 text-xs',
        done && 'bg-muted/40 opacity-70',
        missed && 'border-warning-border bg-warning-subtle/40',
        !done && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <div className="flex items-start gap-2">
        {task.kind === 'gorev' && (
          <input
            type="checkbox"
            className="mt-0.5"
            checked={done}
            disabled={isPending}
            aria-label={done ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı'}
            onChange={(e) => run(() => setTaskDoneAction(task.id, e.target.checked))}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground">{task.scopeName}</p>
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                run(() => updateOwnTaskAction(task.id, title), 'Kaydedildi.')
                setEditing(false)
              }}
            >
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-7 text-xs" autoFocus />
            </form>
          ) : (
            <p className={cn('font-medium', done && 'line-through')}>{task.title}</p>
          )}
        </div>
        <span className="shrink-0 tabular-nums text-muted-foreground">{taskProgressLabel(task)}</span>
      </div>

      {task.kind === 'checklist' && task.checklist.length > 0 && (
        <ul className="space-y-0.5 pl-1">
          {task.checklist.map((item) => (
            <li key={item.id}>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={isPending}
                  onChange={(e) => run(() => toggleChecklistItemAction(item.id, e.target.checked))}
                />
                <span className={cn(item.done && 'text-muted-foreground line-through')}>{item.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {task.kind === 'sure' && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            const add = Number(minutes)
            if (!Number.isInteger(add) || add === 0) return
            const total = Math.max(0, task.doneMinutes + add)
            run(() => setTaskMinutesAction(task.id, total), `${task.doneMinutes + add} dk kaydedildi.`)
            setMinutes('')
          }}
        >
          <Input
            type="number"
            inputMode="numeric"
            placeholder="+ dk"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="h-7 w-20 text-xs"
            aria-label="Çalışılan dakika ekle"
          />
          <Button size="xs" variant="outline" type="submit" disabled={isPending || !minutes}>
            Ekle
          </Button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {own && <Badge variant="info">Kendi çalışman</Badge>}
        {task.tracked && <Badge variant="warning">Öğretmen takipte</Badge>}
        {task.undated && !own && <Badge variant="neutral">Tarihsiz</Badge>}
        {fromEarlier && !done && <Badge variant="neutral">Önceki haftadan</Badge>}
        <span className="flex-1" />
        {own && !done && (
          <Button size="icon-xs" variant="ghost" aria-label="Düzenle" onClick={() => setEditing((v) => !v)}>
            <Pencil />
          </Button>
        )}
        {own && !task.tracked && (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Sil"
            disabled={isPending}
            onClick={() => {
              if (!window.confirm('Bu çalışma silinsin mi?')) return
              run(() => deleteOwnTaskAction(task.id), 'Silindi.')
            }}
          >
            <Trash2 />
          </Button>
        )}
      </div>

      {!done && (
        <NativeSelect
          aria-label="Planladığın gün"
          value={inWindow ? (task.plannedForDate ?? '') : ''}
          disabled={isPending}
          onChange={(e) => run(() => setTaskPlanDateAction(task.id, e.target.value || null))}
          className="h-7 text-xs"
        >
          <option value="">Havuzda (gün seçilmedi)</option>
          {days.map((d) => (
            <option key={d.date} value={d.date}>
              {shortDate(d.date)} {WEEKDAY_SHORT_LABEL[d.weekday as Weekday]}
            </option>
          ))}
        </NativeSelect>
      )}
    </div>
  )
}
