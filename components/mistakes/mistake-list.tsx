'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Archive, ImageIcon, MessageSquareText, Search, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { MISTAKE_REASONS, REASON_LABEL } from '@/lib/mistakes/reasons'
import type { MistakeView } from '@/lib/mistakes/load'
import { cn } from '@/lib/utils'

// HATA LİSTESİ — öğrencide ve öğretmende ortak. Arama, Tekrarda /
// Öğrenildi sekmeleri, ders ve neden süzgeçleri. Öğretmen her kayda koç
// notu yazabilir; öğrenci kendi eklediğini silebilir ya da arşivler.

type Tab = 'review' | 'learned'

export interface MistakeListActions {
  onArchive?: (id: string) => Promise<{ error?: string }>
  onDelete?: (id: string) => Promise<{ error?: string }>
  onTeacherNote?: (id: string, note: string) => Promise<{ error?: string }>
}

export function MistakeList({
  mistakes,
  today,
  role,
  actions,
}: {
  mistakes: MistakeView[]
  today: string
  role: 'student' | 'teacher'
  actions: MistakeListActions
}) {
  const [tab, setTab] = useState<Tab>('review')
  const [q, setQ] = useState('')
  const [subject, setSubject] = useState('')
  const [reason, setReason] = useState('')

  const subjects = useMemo(() => [...new Set(mistakes.map(m => `${m.exam_tag} · ${m.subject}`))].sort((a, b) => a.localeCompare(b, 'tr')), [mistakes])
  const counts = { review: mistakes.filter(m => m.status === 'review').length, learned: mistakes.filter(m => m.status === 'learned').length }

  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr')
    return mistakes
      .filter(m => m.status === tab)
      .filter(m => !subject || `${m.exam_tag} · ${m.subject}` === subject)
      .filter(m => !reason || m.reason === reason)
      .filter(
        m =>
          !needle ||
          [m.subject, m.topic, m.source, m.solution_note, m.teacher_note, m.page_ref].some(v => v?.toLocaleLowerCase('tr').includes(needle))
      )
      .sort((a, b) => (a.next_review_on ?? '9999') .localeCompare(b.next_review_on ?? '9999') || b.created_at.localeCompare(a.created_at))
  }, [mistakes, tab, subject, reason, q])

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1" role="tablist" aria-label="Hata durumu">
        {(['review', 'learned'] as Tab[]).map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn('flex-1 rounded-md px-3 py-1.5 text-sm', tab === t ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground')}
          >
            {t === 'review' ? 'Tekrarda' : 'Öğrenildi'} <span className="tabular-nums text-muted-foreground">{counts[t]}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_12rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Hatalarda ara" placeholder="Konu, kaynak ya da notta ara" value={q} onChange={e => setQ(e.target.value)} className="pl-8" />
        </div>
        <NativeSelect aria-label="Ders" value={subject} onChange={e => setSubject(e.target.value)}>
          <option value="">Tüm dersler</option>
          {subjects.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Neden" value={reason} onChange={e => setReason(e.target.value)}>
          <option value="">Tüm nedenler</option>
          {MISTAKE_REASONS.map(r => (
            <option key={r} value={r}>
              {REASON_LABEL[r]}
            </option>
          ))}
        </NativeSelect>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {mistakes.length === 0
            ? role === 'student'
              ? 'Defterin boş. Yanlış yaptığın ilk soruyu ekle; tekrarı biz hatırlatırız.'
              : 'Öğrenci henüz deftere hata eklemedi.'
            : 'Bu süzgeçle eşleşen hata yok.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map(m => (
            <MistakeCard key={m.id} m={m} today={today} role={role} actions={actions} />
          ))}
        </ul>
      )}
    </div>
  )
}

export function reviewLabel(next: string | null, today: string): string {
  if (!next) return 'Öğrenildi'
  if (next <= today) return 'Tekrar: bugün'
  const days = Math.round((Date.parse(`${next}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000)
  return days === 1 ? 'Tekrar: yarın' : `Tekrar: ${days} gün sonra`
}

function MistakeCard({ m, today, role, actions }: { m: MistakeView; today: string; role: 'student' | 'teacher'; actions: MistakeListActions }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(m.teacher_note ?? '')
  const due = m.status === 'review' && !!m.next_review_on && m.next_review_on <= today

  function run(fn: () => Promise<{ error?: string }>, ok: string) {
    startTransition(async () => {
      const r = await fn()
      if (r.error) toast.error(r.error)
      else {
        toast.success(ok)
        router.refresh()
      }
    })
  }

  const canDelete = role === 'teacher' || m.created_by_role === 'student'

  return (
    <li className="rounded-lg border bg-card">
      <button type="button" className="flex w-full items-start gap-3 p-3 text-left" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {m.questionPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- kısa ömürlü imzalı adres
            <img src={m.questionPhotoUrl} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            <span className="mr-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">{m.exam_tag}</span>
            {m.subject}
            {m.topic ? ` · ${m.topic}` : ''}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[m.source, m.page_ref, REASON_LABEL[m.reason], m.correct_answer ? `Cevap ${m.correct_answer}` : null].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant={due ? 'warning' : 'neutral'} className="text-[11px]">
              {reviewLabel(m.status === 'review' ? m.next_review_on : null, today)}
            </Badge>
            {m.teacher_note && (
              <Badge variant="info" className="text-[11px]">
                <MessageSquareText className="size-3" /> Koç notu
              </Badge>
            )}
            {m.created_by_role === 'teacher' && role === 'student' && (
              <Badge variant="neutral" className="text-[11px]">
                Koçun ekledi
              </Badge>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t p-3 text-sm">
          {(m.questionPhotoUrl || m.solutionPhotoUrl) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {m.questionPhotoUrl && <Photo url={m.questionPhotoUrl} label="Soru" />}
              {m.solutionPhotoUrl && <Photo url={m.solutionPhotoUrl} label="Çözüm" />}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <Item k="Cevabın" v={m.student_answer === 'bos' ? 'Boş' : m.student_answer} />
            <Item k="Doğru" v={m.correct_answer} />
            <Item k="Tekrar sayısı" v={String(m.review_count)} />
            <Item k="Kutu" v={`${m.box} / 5`} />
          </dl>
          {m.solution_note && <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2">{m.solution_note}</p>}

          {role === 'teacher' && actions.onTeacherNote ? (
            <div className="space-y-2">
              <Textarea
                aria-label="Koç notu"
                rows={2}
                maxLength={1000}
                placeholder="Öğrenciye not (öğrenci görür): ör. Bu tipi perşembe birlikte çözelim."
                value={note}
                onChange={e => setNote(e.target.value)}
              />
              <Button size="sm" disabled={isPending || note === (m.teacher_note ?? '')} onClick={() => run(() => actions.onTeacherNote!(m.id, note), 'Koç notu kaydedildi.')}>
                Notu kaydet
              </Button>
            </div>
          ) : (
            m.teacher_note && (
              <p className="whitespace-pre-wrap rounded-md border border-info/30 bg-info/5 p-2">
                <span className="font-medium">Koç notu: </span>
                {m.teacher_note}
              </p>
            )
          )}

          <div className="flex flex-wrap gap-2">
            {actions.onArchive && m.status === 'review' && (
              <Button size="xs" variant="ghost" disabled={isPending} onClick={() => run(() => actions.onArchive!(m.id), 'Hata arşivlendi.')}>
                <Archive /> Arşivle
              </Button>
            )}
            {actions.onDelete && canDelete && (
              <Button
                size="xs"
                variant="ghost"
                className="text-destructive"
                disabled={isPending}
                onClick={() => run(() => actions.onDelete!(m.id), 'Hata silindi.')}
              >
                <Trash2 /> Sil
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

function Item({ k, v }: { k: string; v: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v ?? '—'}</dd>
    </div>
  )
}

export function Photo({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element -- kısa ömürlü imzalı adres */}
      <img src={url} alt={label} className="max-h-72 w-full object-contain" />
    </a>
  )
}
