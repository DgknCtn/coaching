'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { accuracy, formatNet, net, penaltyDivisor, type ExamTag } from '@/lib/mistakes/net'
import type { QuestionLogView } from '@/lib/mistakes/load'
import type { QuestionLogInput } from '@/lib/mistakes/schema'
import { Chip } from './mistake-form'

// SORU ÇÖZÜMÜ KAYDI — doğru/yanlış/boş artı-eksi ile; net anında
// hesaplanır (YKS 4, LGS 3 yanlış bir doğruyu götürür).

const OTHER = '__diger'

export function QuestionLogger({
  today,
  examTags,
  subjects,
  todayLogs,
  onSubmit,
  onDelete,
}: {
  today: string
  examTags: ExamTag[]
  subjects: { id: string; name: string }[]
  todayLogs: QuestionLogView[]
  onSubmit: (input: QuestionLogInput) => Promise<{ error?: string }>
  onDelete?: (id: string) => Promise<{ error?: string }>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [examTag, setExamTag] = useState<ExamTag>(examTags[0])
  const [scopeId, setScopeId] = useState(subjects[0]?.id ?? OTHER)
  const [subjectText, setSubjectText] = useState('')
  const [topicText, setTopicText] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [counts, setCounts] = useState({ correct: 0, wrong: 0, blank: 0 })

  const divisor = penaltyDivisor(examTag)
  const liveNet = net(counts.correct, counts.wrong, divisor)
  const total = counts.correct + counts.wrong + counts.blank

  function submit() {
    const isOther = scopeId === OTHER
    startTransition(async () => {
      const r = await onSubmit({
        logDate: today,
        examTag,
        scopeId: isOther ? null : scopeId,
        subjectText: isOther ? subjectText : null,
        topicText,
        sourceText,
        ...counts,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(`${total} soru kaydedildi · net ${formatNet(liveNet)}`)
      setCounts({ correct: 0, wrong: 0, blank: 0 })
      setTopicText('')
      router.refresh()
    })
  }

  function remove(id: string) {
    if (!onDelete) return
    startTransition(async () => {
      const r = await onDelete(id)
      if (r.error) toast.error(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border bg-card p-4">
        {examTags.length > 1 && (
          <div className="flex gap-2">
            {examTags.map(t => (
              <Chip key={t} active={examTag === t} onClick={() => setExamTag(t)}>
                {t}
              </Chip>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ql-subject">Ders</Label>
            <NativeSelect id="ql-subject" value={scopeId} onChange={e => setScopeId(e.target.value)}>
              {subjects.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={OTHER}>Diğer (yazarak)</option>
            </NativeSelect>
            {scopeId === OTHER && (
              <Input placeholder="Ders adı" maxLength={80} value={subjectText} onChange={e => setSubjectText(e.target.value)} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ql-topic">Konu (isteğe bağlı)</Label>
            <Input id="ql-topic" maxLength={120} placeholder="ör. Paragraf" value={topicText} onChange={e => setTopicText(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ql-source">Kaynak (isteğe bağlı)</Label>
            <Input id="ql-source" maxLength={160} placeholder="ör. Deneme 4" value={sourceText} onChange={e => setSourceText(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['correct', 'Doğru'],
              ['wrong', 'Yanlış'],
              ['blank', 'Boş'],
            ] as const
          ).map(([k, label]) => (
            <Counter
              key={k}
              label={label}
              value={counts[k]}
              onChange={v => setCounts(c => ({ ...c, [k]: v }))}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
          <span>
            Net <span className="font-semibold tabular-nums">{formatNet(liveNet)}</span>
            {divisor > 0 && <span className="text-muted-foreground"> · {divisor} yanlış 1 doğruyu götürür</span>}
          </span>
          <span className="text-muted-foreground">
            {total} soru{accuracy(counts.correct, counts.wrong, counts.blank) !== null ? ` · %${accuracy(counts.correct, counts.wrong, counts.blank)} doğru` : ''}
          </span>
        </div>
        <Button className="w-full" disabled={isPending || total === 0} onClick={submit}>
          {isPending && <Loader2 className="animate-spin" />}
          Kaydet
        </Button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Bugün çözdüklerin</h2>
        {todayLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bugün henüz kayıt yok.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {todayLogs.map(l => (
              <LogRow key={l.id} log={l} onRemove={onDelete ? () => remove(l.id) : undefined} disabled={isPending} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function LogRow({ log: l, onRemove, disabled }: { log: QuestionLogView; onRemove?: () => void; disabled?: boolean }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          <span className="mr-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-semibold text-muted-foreground">{l.exam_tag}</span>
          {l.subject}
          {l.topic_text ? ` · ${l.topic_text}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          {l.correct} D · {l.wrong} Y · {l.blank} B{l.source_text ? ` · ${l.source_text}` : ''}
        </p>
      </div>
      <span className="text-sm font-semibold tabular-nums">{formatNet(net(l.correct, l.wrong, l.penalty_divisor))}</span>
      {onRemove && (
        <Button size="icon-xs" variant="ghost" aria-label="Kaydı sil" disabled={disabled} onClick={onRemove}>
          <Trash2 />
        </Button>
      )}
    </li>
  )
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1 text-center">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1">
        <Button type="button" size="icon-sm" variant="outline" aria-label={`${label} azalt`} onClick={() => onChange(Math.max(0, value - 1))}>
          <Minus />
        </Button>
        <Input
          aria-label={label}
          inputMode="numeric"
          className="h-8 px-1 text-center tabular-nums"
          value={value}
          onChange={e => {
            const n = Number(e.target.value.replace(/\D/g, ''))
            onChange(Number.isFinite(n) ? Math.min(1000, n) : 0)
          }}
        />
        <Button type="button" size="icon-sm" variant="outline" aria-label={`${label} artır`} onClick={() => onChange(Math.min(1000, value + 1))}>
          <Plus />
        </Button>
      </div>
    </div>
  )
}
