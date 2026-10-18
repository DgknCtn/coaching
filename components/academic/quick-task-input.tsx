'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CornerDownLeft } from 'lucide-react'
import { parseQuickTask, TASK_KIND_LABEL } from '@/lib/academic-tasks'
import { createTaskAction } from '@/app/(dashboard)/teacher/students/[studentId]/dersler/actions'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// HIZLI GÖREV — "form doldurmak kadar ağır değil, Enter'a basmak kadar
// hızlı" (M1.0-03 §3). Ders zaten bilindiği için ders sorulmaz; tür
// metinden çıkar ("120 dk" → süre hedefi, "Başlık: a / b" → checklist).
//
// Varsayılan: o haftanın TASLAK planına. Haftalık plan zaten yayınlanmışsa
// küçük seçim: "Bu haftaya ekle" (varsayılan) / "Sonraki plana bırak".

export function QuickTaskInput({
  studentId,
  scopeId,
  planPublished,
  className,
}: {
  studentId: string
  scopeId: string
  /** Aktif haftada yayınlanmış plan var mı? Varsa seçim gösterilir. */
  planPublished: boolean
  className?: string
}) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [target, setTarget] = useState<'bu-hafta' | 'sonraki'>('bu-hafta')
  const [isPending, startTransition] = useTransition()
  const preview = parseQuickTask(text)

  function submit() {
    const q = parseQuickTask(text)
    if (!q) return
    const publish = planPublished && target === 'bu-hafta'
    startTransition(async () => {
      const r = await createTaskAction({
        studentId,
        scopeId,
        kind: q.kind,
        title: q.title,
        targetMinutes: q.targetMinutes,
        checklist: q.checklist,
        publish,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(publish ? 'Bu haftaya eklendi.' : 'Sepete eklendi.')
      setText('')
      router.refresh()
    })
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <Input
          value={text}
          disabled={isPending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Bir görev yaz ve Enter'a bas…"
          aria-label="Hızlı görev"
          className="pr-24"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-xs text-muted-foreground">
          {preview && preview.kind !== 'gorev' ? TASK_KIND_LABEL[preview.kind] : null}
          <CornerDownLeft className="size-3.5" aria-hidden />
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>&quot;120 dk&quot; süre hedefi; &quot;Başlık: a / b&quot; checklist olur.</span>
        {planPublished && (
          <div role="radiogroup" aria-label="Görev nereye eklensin" className="inline-flex rounded-md border">
            {(
              [
                ['bu-hafta', 'Bu haftaya ekle'],
                ['sonraki', 'Sonraki plana bırak'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={target === key}
                onClick={() => setTarget(key)}
                className={cn(
                  'px-2 py-1 first:rounded-l-md last:rounded-r-md',
                  target === key ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
