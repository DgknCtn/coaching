'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, ImageIcon, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/shared/progress-bar'
import { REASON_LABEL } from '@/lib/mistakes/reasons'
import type { MistakeView } from '@/lib/mistakes/load'
import { Photo } from './mistake-list'

// SORU TEKRARI — kart kart. Önce yalnız soru (fotoğraf ya da kaynak
// bilgisi); "Cevabı göster" doğru cevabı, çözüm fotoğrafını ve notları
// açar; "Bildim / Bilemedim" kutuyu record_mistake_review ile ilerletir.

export function ReviewSession({
  items,
  onReview,
  onFinish,
  doneHref,
}: {
  items: MistakeView[]
  onReview: (id: string, result: 'knew' | 'missed') => Promise<{ error?: string; status?: string }>
  onFinish: () => Promise<void>
  doneHref: string
}) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [tally, setTally] = useState({ knew: 0, missed: 0, learned: 0 })
  const [isPending, startTransition] = useTransition()
  const total = items.length
  const done = index >= total

  function finish() {
    startTransition(async () => {
      await onFinish()
      router.push(doneHref)
    })
  }

  function answer(result: 'knew' | 'missed') {
    const m = items[index]
    startTransition(async () => {
      const r = await onReview(m.id, result)
      if (r.error) {
        toast.error(r.error)
        return
      }
      setTally(t => ({
        knew: t.knew + (result === 'knew' ? 1 : 0),
        missed: t.missed + (result === 'missed' ? 1 : 0),
        learned: t.learned + (r.status === 'learned' ? 1 : 0),
      }))
      setRevealed(false)
      setIndex(i => i + 1)
    })
  }

  if (total === 0 || done) {
    return (
      <div className="space-y-4 rounded-lg border bg-card p-6 text-center">
        <p className="text-base font-semibold">{total === 0 ? 'Bugün tekrar edilecek soru yok' : 'Tekrar bitti'}</p>
        {total > 0 && (
          <p className="text-sm text-muted-foreground">
            {tally.knew} bildin, {tally.missed} tekrar listesine döndü
            {tally.learned > 0 ? `, ${tally.learned} hata öğrenildi` : ''}.
          </p>
        )}
        <Button onClick={finish} disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Deftere dön
        </Button>
      </div>
    )
  }

  const m = items[index]
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="tabular-nums text-muted-foreground">
          {index + 1} / {total}
        </span>
        <button type="button" className="font-medium text-primary hover:underline" onClick={finish} disabled={isPending}>
          Tekrarı bitir
        </button>
      </div>
      <ProgressBar value={Math.round((index / total) * 100)} />

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div>
          <p className="font-medium">
            <span className="mr-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-semibold text-muted-foreground">{m.exam_tag}</span>
            {m.subject}
            {m.topic ? ` · ${m.topic}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">{[m.source, m.page_ref].filter(Boolean).join(' · ') || 'Kaynak belirtilmemiş'}</p>
        </div>
        {m.questionPhotoUrl ? (
          <Photo url={m.questionPhotoUrl} label="Soru" />
        ) : (
          <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-sm text-muted-foreground">
            <ImageIcon className="size-5" />
            Fotoğraf yok: soruyu kaynağından aç ve yeniden çöz.
          </div>
        )}

        {revealed ? (
          <div className="space-y-2 border-t pt-3 text-sm">
            <p>
              Doğru cevap: <span className="font-semibold">{m.correct_answer ?? '—'}</span>
              {m.student_answer ? ` · Senin cevabın: ${m.student_answer === 'bos' ? 'Boş' : m.student_answer}` : ''}
            </p>
            <p className="text-muted-foreground">Neden: {REASON_LABEL[m.reason]}</p>
            {m.solutionPhotoUrl && <Photo url={m.solutionPhotoUrl} label="Çözüm" />}
            {m.solution_note && <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2">{m.solution_note}</p>}
            {m.teacher_note && (
              <p className="whitespace-pre-wrap rounded-md border border-info/30 bg-info/5 p-2">
                <span className="font-medium">Koç notu: </span>
                {m.teacher_note}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {revealed ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" disabled={isPending} onClick={() => answer('missed')}>
            <X /> Bilemedim
          </Button>
          <Button size="lg" disabled={isPending} onClick={() => answer('knew')}>
            <Check /> Bildim
          </Button>
        </div>
      ) : (
        <Button size="lg" className="w-full" onClick={() => setRevealed(true)}>
          Cevabı göster
        </Button>
      )}
      <p className="text-center text-xs text-muted-foreground">
        Bildiğin soru giderek daha seyrek gelir (1, 3, 7, 14, 30 gün). Bilemediğin yarın yeniden gelir.{' '}
        <Link href={doneHref} className="underline">
          Deftere dön
        </Link>
      </p>
    </div>
  )
}
