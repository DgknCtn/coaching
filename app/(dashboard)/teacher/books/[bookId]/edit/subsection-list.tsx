'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { testCountFromRange } from '@/lib/book-structure'
import {
  addSubsectionAction,
  deleteSubsectionAction,
  renameSubsectionAction,
  setSubsectionTestRangeAction,
} from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// R7-03: bölümün alt bölümleri.
//
// NEDEN VAR: 3D TYT'de 01. Bölüm ~200 sayfa ve içinde Temel Kavramlar,
// Üslü Sayılar, TÜMEVARIM gibi ~30 ayrı ödev birimi var. "Bölüm + test
// sayısı" bunu temsil edemiyordu; öğretmen "Üslü Sayılar Test 44-48"
// ödevi veremiyordu.
//
// TEST ADEDİ GİRİLMEZ: şartnamenin kuralı "Son - İlk + 1". Adet salt
// okunur gösterilir.
//
// Kalıp PartsCard/PartRowForm ile aynıdır; tek fark alt bölümün kitap
// değil BÖLÜM düzeyinde yaşaması. Ayrı dosyada çünkü book-edit-form.tsx
// zaten 900 satırın üstünde.

export interface SubsectionRow {
  id: string
  title: string
  testStart: number | null
  testEnd: number | null
  testCount: number
}

export function SubsectionList({
  bookId,
  sectionId,
  subsections,
  sectionTestCount,
  hasProgress,
}: {
  bookId: string
  sectionId: string
  subsections: SubsectionRow[]
  /** Bölümün KENDİ testleri; alt bölüme geçişi engelleyen tek şey. */
  sectionTestCount: number
  hasProgress: boolean
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [isPending, startTransition] = useTransition()

  const newCount = testCountFromRange(Number(start) || null, Number(end) || null)

  // Bölümün kendi testleri varsa alt bölüme geçilemez (RPC de reddediyor);
  // kullanıcı bunu denemeden önce görmeli.
  const blocked = subsections.length === 0 && sectionTestCount > 0

  function add() {
    startTransition(async () => {
      const r = await addSubsectionAction(bookId, sectionId, title, Number(start), Number(end))
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success('Alt bölüm eklendi.')
      setTitle('')
      setStart('')
      setEnd('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label>Alt bölümler</Label>
        {subsections.length > 0 && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {subsections.length} alt bölüm ·{' '}
            {subsections.reduce((sum, s) => sum + s.testCount, 0)} test
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Bölüm çok konuluysa ve her konuya ayrı ödev verilecekse alt bölüm ekleyin.
        Test numarası her alt bölümde kendi içinde sayılır — aynı numara farklı alt
        bölümlerde tekrar edebilir.
      </p>

      {subsections.map(sub => (
        <SubsectionRowForm
          key={sub.id}
          bookId={bookId}
          subsection={sub}
          hasProgress={hasProgress}
        />
      ))}

      {blocked ? (
        <p className="rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning-foreground">
          Bu bölümün kendi testleri var. Alt bölüm eklemek için önce bölümün test
          sayısını sıfırlayın; aynı bölümde iki ayrı test kaynağı olamaz.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2.5">
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor={`sub-title-${sectionId}`} className="text-xs">
              Alt bölüm adı
            </Label>
            <Input
              id={`sub-title-${sectionId}`}
              placeholder="Örn: Üslü Sayılar"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div className="w-24 space-y-1.5">
            <Label htmlFor={`sub-start-${sectionId}`} className="text-xs">
              İlk test
            </Label>
            <Input
              id={`sub-start-${sectionId}`}
              type="number"
              min={1}
              value={start}
              onChange={e => setStart(e.target.value)}
            />
          </div>
          <div className="w-24 space-y-1.5">
            <Label htmlFor={`sub-end-${sectionId}`} className="text-xs">
              Son test
            </Label>
            <Input
              id={`sub-end-${sectionId}`}
              type="number"
              min={1}
              value={end}
              onChange={e => setEnd(e.target.value)}
            />
          </div>
          <div className="w-16 space-y-1.5">
            <Label className="text-xs">Adet</Label>
            <p className="flex h-9 items-center px-1 text-sm tabular-nums text-muted-foreground">
              {newCount || '—'}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending || !title.trim() || newCount === 0}
            onClick={add}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus />}
            Alt bölüm ekle
          </Button>
        </div>
      )}
    </div>
  )
}

function SubsectionRowForm({
  bookId,
  subsection,
  hasProgress,
}: {
  bookId: string
  subsection: SubsectionRow
  hasProgress: boolean
}) {
  const router = useRouter()
  const [title, setTitle] = useState(subsection.title)
  const [start, setStart] = useState(subsection.testStart ? String(subsection.testStart) : '')
  const [end, setEnd] = useState(subsection.testEnd ? String(subsection.testEnd) : '')
  const [isPending, startTransition] = useTransition()

  const count = testCountFromRange(Number(start) || null, Number(end) || null)
  const titleChanged = title.trim() !== subsection.title
  const rangeChanged =
    (Number(start) || 0) !== (subsection.testStart ?? 0) ||
    (Number(end) || 0) !== (subsection.testEnd ?? 0)

  function save() {
    startTransition(async () => {
      // Ad ve aralık ayrı RPC'ler; ikisi de değiştiyse sırayla gider.
      // Aralık reddedilirse ad değişikliği yine de kaydedilmiş olur —
      // yarım kalan bu durum kullanıcıya toast ile bildirilir.
      if (titleChanged) {
        const r = await renameSubsectionAction(bookId, subsection.id, title)
        if (r?.error) {
          toast.error(r.error)
          return
        }
      }
      if (rangeChanged) {
        const r = await setSubsectionTestRangeAction(
          bookId,
          subsection.id,
          Number(start),
          Number(end)
        )
        if (r?.error) {
          toast.error(r.error)
          router.refresh()
          return
        }
      }
      toast.success('Alt bölüm güncellendi.')
      router.refresh()
    })
  }

  function remove() {
    startTransition(async () => {
      if (
        !window.confirm(
          `"${subsection.title}" alt bölümü ve testleri silinecek. Devam edilsin mi?`
        )
      ) {
        return
      }
      const r = await deleteSubsectionAction(bookId, subsection.id)
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success('Alt bölüm silindi.')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-2.5">
      <div className="min-w-40 flex-1 space-y-1.5">
        <Label htmlFor={`subname-${subsection.id}`} className="text-xs">
          Alt bölüm adı
        </Label>
        <Input
          id={`subname-${subsection.id}`}
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </div>
      <div className="w-24 space-y-1.5">
        <Label htmlFor={`substart-${subsection.id}`} className="text-xs">
          İlk test
        </Label>
        <Input
          id={`substart-${subsection.id}`}
          type="number"
          min={1}
          value={start}
          disabled={hasProgress}
          onChange={e => setStart(e.target.value)}
        />
      </div>
      <div className="w-24 space-y-1.5">
        <Label htmlFor={`subend-${subsection.id}`} className="text-xs">
          Son test
        </Label>
        <Input
          id={`subend-${subsection.id}`}
          type="number"
          min={1}
          value={end}
          disabled={hasProgress}
          onChange={e => setEnd(e.target.value)}
        />
      </div>
      <div className="w-16 space-y-1.5">
        <Label className="text-xs">Adet</Label>
        <p className="flex h-9 items-center px-1 text-sm tabular-nums text-muted-foreground">
          {count || '—'}
        </p>
      </div>

      <Button size="sm" disabled={isPending || (!titleChanged && !rangeChanged)} onClick={save}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save />}
        Kaydet
      </Button>
      <Button size="sm" variant="ghost" disabled={isPending} onClick={remove}>
        <Trash2 />
        Sil
      </Button>

      {hasProgress && (
        <p className="basis-full text-[11px] text-muted-foreground">
          Bu kaynakta ilerleme var; aralık değiştirilemez. Ad değiştirilebilir.
        </p>
      )}
    </div>
  )
}
