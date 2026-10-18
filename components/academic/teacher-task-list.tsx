'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MoreHorizontal } from 'lucide-react'
import { TASK_KIND_LABEL, taskProgressLabel, type AcademicTask } from '@/lib/academic-tasks'
import { APP_TIME_ZONE } from '@/lib/homework-status'
import {
  deleteTaskAction,
  setTaskClosedAction,
  setTaskDueAction,
  setTaskTrackedAction,
  updateTaskAction,
} from '@/app/(dashboard)/teacher/students/[studentId]/dersler/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// Öğretmen görev satırları (Ders detayı + sepet). Plan son teslimi
// varsayılandır; satırda yalnız İSTİSNA aksiyonları (§5): Düzenle ·
// Farklı teslim tarihi · Tarihsiz yap · Sepetten çıkar.

const dueFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  weekday: 'short',
})

export function dueText(task: AcademicTask): string {
  if (task.undated) return 'Tarihsiz'
  if (task.dueAt) return `Teslim ${dueFormatter.format(new Date(task.dueAt))}`
  return task.status === 'draft' ? 'Plan teslimi' : '—'
}

function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function TeacherTaskList({
  studentId,
  tasks,
  showCourse = false,
  emptyText = 'Görev yok.',
}: {
  studentId: string
  tasks: AcademicTask[]
  showCourse?: boolean
  emptyText?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<{ task: AcademicTask; focus: 'text' | 'due' } | null>(null)

  function run(action: () => Promise<{ error?: string }>, ok: string) {
    startTransition(async () => {
      const r = await action()
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(ok)
      router.refresh()
    })
  }

  if (tasks.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>

  return (
    <>
      <ul className="divide-y text-sm">
        {tasks.map((t) => {
          const finished = t.status === 'done' || t.status === 'closed'
          return (
            <li key={t.id} className={cn('flex items-center justify-between gap-3 py-2', finished && 'opacity-60')}>
              <div className="min-w-0">
                <p className={cn('truncate', finished && 'line-through')}>
                  {showCourse && <span className="text-muted-foreground">{t.scopeName} — </span>}
                  {t.title}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span>{TASK_KIND_LABEL[t.kind]}</span>
                  <span>·</span>
                  <span>{dueText(t)}</span>
                  {t.kind === 'checklist' && t.checklist.length > 0 && (
                    <span>· {t.checklist.map((i) => i.title).join(' / ')}</span>
                  )}
                  {t.createdByRole === 'student' && (
                    <Badge variant="info" className="ml-1">
                      Öğrenci ekledi
                    </Badge>
                  )}
                  {t.tracked && <Badge variant="warning">Takipte</Badge>}
                  {t.status === 'draft' && <Badge variant="neutral">Taslak</Badge>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">{taskProgressLabel(t)}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="Görev işlemleri"
                    disabled={isPending}
                    className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted"
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => setEditing({ task: t, focus: 'text' })}>Düzenle</DropdownMenuItem>
                    {!finished && (
                      <DropdownMenuItem onClick={() => setEditing({ task: t, focus: 'due' })}>
                        Farklı teslim tarihi
                      </DropdownMenuItem>
                    )}
                    {!finished && !t.undated && (
                      <DropdownMenuItem
                        onClick={() =>
                          run(
                            () => setTaskDueAction({ studentId, taskId: t.id, title: t.title, mode: 'undated' }),
                            'Tarihsiz yapıldı.'
                          )
                        }
                      >
                        Tarihsiz yap
                      </DropdownMenuItem>
                    )}
                    {!finished && t.undated && t.status === 'draft' && (
                      <DropdownMenuItem
                        onClick={() =>
                          run(
                            () => setTaskDueAction({ studentId, taskId: t.id, title: t.title, mode: 'plan' }),
                            'Plan teslimine bağlandı.'
                          )
                        }
                      >
                        Plan teslimine bağla
                      </DropdownMenuItem>
                    )}
                    {t.createdByRole === 'student' && (
                      <DropdownMenuItem
                        onClick={() =>
                          run(
                            () => setTaskTrackedAction(studentId, t.id, !t.tracked),
                            t.tracked ? 'Takipten çıkarıldı.' : 'Takibe alındı.'
                          )
                        }
                      >
                        {t.tracked ? 'Takipten çıkar' : 'Takibe al'}
                      </DropdownMenuItem>
                    )}
                    {t.status !== 'draft' && t.status !== 'done' && (
                      <DropdownMenuItem
                        onClick={() =>
                          run(
                            () => setTaskClosedAction(studentId, t.id, t.status !== 'closed'),
                            t.status === 'closed' ? 'Yeniden açıldı.' : 'Görev kapatıldı.'
                          )
                        }
                      >
                        {t.status === 'closed' ? 'Yeniden aç' : 'Kapat (artık gerekmiyor)'}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        if (t.status !== 'draft' && !window.confirm('Görev öğrencinin haftasından da silinsin mi?')) return
                        run(() => deleteTaskAction(studentId, t.id), t.status === 'draft' ? 'Sepetten çıkarıldı.' : 'Görev silindi.')
                      }}
                    >
                      {t.status === 'draft' ? 'Sepetten çıkar' : 'Sil'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          )
        })}
      </ul>
      {editing && (
        <TaskEditDialog
          key={editing.task.id + editing.focus}
          studentId={studentId}
          task={editing.task}
          focus={editing.focus}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function TaskEditDialog({
  studentId,
  task,
  focus,
  onClose,
}: {
  studentId: string
  task: AcademicTask
  focus: 'text' | 'due'
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState(task.title)
  const [minutes, setMinutes] = useState(task.targetMinutes ? String(task.targetMinutes) : '')
  const [due, setDue] = useState(toLocalInput(task.dueAt))

  function save() {
    startTransition(async () => {
      const r =
        focus === 'due'
          ? await setTaskDueAction({
              studentId,
              taskId: task.id,
              title,
              mode: 'date',
              dueAtIso: new Date(due).toISOString(),
            })
          : await updateTaskAction({
              studentId,
              taskId: task.id,
              title,
              targetMinutes: task.kind === 'sure' && minutes ? Number(minutes) : null,
            })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success('Kaydedildi.')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{focus === 'due' ? 'Farklı teslim tarihi' : 'Görevi düzenle'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {focus === 'text' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="taskTitle">Görev</Label>
                <Input id="taskTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              {task.kind === 'sure' && (
                <div className="space-y-1.5">
                  <Label htmlFor="taskMinutes">Hedef (dk)</Label>
                  <Input
                    id="taskMinutes"
                    type="number"
                    min={1}
                    max={6000}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="taskDue">Teslim</Label>
              <Input id="taskDue" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
              <p className="text-xs text-muted-foreground">Yalnız bu görev için; planın son teslimi değişmez.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button disabled={isPending} onClick={save}>
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
