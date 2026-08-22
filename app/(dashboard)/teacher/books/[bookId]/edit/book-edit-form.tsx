'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Copy, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  updateBookAction,
  duplicateBookAsEditionAction,
  renameSectionAction,
  setSectionTestCountAction,
  addSectionAction,
  addPageSectionAction,
  deleteSectionAction,
} from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  SUBJECTS,
  LEVEL_EXAMS,
  VIDEO_MODE_OPTIONS,
  EDITION_YEAR_MIN,
  EDITION_YEAR_MAX,
} from '@/lib/book-taxonomy'

const schema = z.object({
  title: z.string().min(2, 'Kitap adı en az 2 karakter olmalı'),
  subject: z.string().min(1, 'Ders seçin'),
  publisher: z.string().optional(),
  levelExam: z.string().optional(),
  editionYear: z.number().int().min(EDITION_YEAR_MIN).max(EDITION_YEAR_MAX).optional().or(z.nan()),
  description: z.string().optional(),
  videoMode: z.enum(['none', 'book', 'section']),
  videoUrl: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export interface SectionRow {
  id: string
  title: string
  testCount: number
}

interface Props {
  bookId: string
  defaultValues: FormData
  sections: SectionRow[]
  /** 'page' kitaplarda birimler test değil sayfa aralığı olarak adlandırılır. */
  trackingMode: string
}

export function BookEditForm({ bookId, defaultValues, sections, trackingMode }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const unitLabel = trackingMode === 'page' ? 'Sayfa aralığı' : 'Test'

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      const result = await updateBookAction(bookId, {
        title: data.title,
        subject: data.subject,
        publisher: data.publisher || undefined,
        levelExam: data.levelExam || undefined,
        editionYear: Number.isFinite(data.editionYear) ? (data.editionYear as number) : null,
        description: data.description || undefined,
        videoMode: data.videoMode,
        videoUrl: data.videoUrl || undefined,
      })
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success('Kitap bilgileri güncellendi.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kitap bilgileri</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Kitap Adı *</Label>
              <Input id="title" aria-invalid={!!errors.title} {...register('title')} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="subject">Ders *</Label>
                <NativeSelect id="subject" {...register('subject')}>
                  <option value="">Seçin</option>
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </NativeSelect>
                {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="levelExam">Seviye / Sınav Türü</Label>
                <NativeSelect id="levelExam" {...register('levelExam')}>
                  <option value="">Seçin</option>
                  {LEVEL_EXAMS.map((l) => <option key={l} value={l}>{l}</option>)}
                </NativeSelect>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="publisher">Yayın</Label>
                <Input id="publisher" {...register('publisher')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editionYear">Baskı Yılı</Label>
                <Input
                  id="editionYear"
                  type="number"
                  min={EDITION_YEAR_MIN}
                  max={EDITION_YEAR_MAX}
                  {...register('editionYear', { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="videoMode">Video Desteği</Label>
                <NativeSelect id="videoMode" {...register('videoMode')}>
                  {VIDEO_MODE_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="videoUrl">Video Bağlantısı</Label>
                <Input id="videoUrl" placeholder="Kanal veya oynatma listesi" {...register('videoUrl')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Açıklama</Label>
              <Textarea id="description" rows={2} {...register('description')} />
            </div>

            <p className="text-xs text-muted-foreground">
              Takip türü (test / sayfa aralığı) sonradan değiştirilemez — mevcut
              tamamlama kayıtlarının anlamı bozulur.
            </p>

            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save />}
              Kaydet
            </Button>
          </form>
        </CardContent>
      </Card>

      <NewEditionCard bookId={bookId} currentYear={defaultValues.editionYear} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bölümler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sections.map((section) => (
            <SectionRowForm
              key={section.id}
              bookId={bookId}
              section={section}
              unitLabel={unitLabel}
            />
          ))}

          {trackingMode === 'page' ? (
            <NewPageSectionForm bookId={bookId} />
          ) : (
            <NewSectionForm bookId={bookId} unitLabel={unitLabel} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SectionRowForm({
  bookId,
  section,
  unitLabel,
}: {
  bookId: string
  section: SectionRow
  unitLabel: string
}) {
  const router = useRouter()
  const [title, setTitle] = useState(section.title)
  const [count, setCount] = useState(String(section.testCount))
  const [isPending, startTransition] = useTransition()

  const dirty = title !== section.title || Number(count) !== section.testCount

  function save() {
    startTransition(async () => {
      if (title !== section.title) {
        const r = await renameSectionAction(bookId, section.id, title)
        if (r?.error) {
          toast.error(r.error)
          return
        }
      }
      if (Number(count) !== section.testCount) {
        const r = await setSectionTestCountAction(bookId, section.id, Number(count))
        if (r?.error) {
          // Kullanılmış test silinemez — RPC'nin Türkçe mesajı burada görünür.
          toast.error(r.error)
          setCount(String(section.testCount))
          return
        }
      }
      toast.success('Bölüm güncellendi.')
      router.refresh()
    })
  }

  function remove() {
    startTransition(async () => {
      const r = await deleteSectionAction(bookId, section.id)
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success('Bölüm silindi.')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="min-w-48 flex-1 space-y-1.5">
        <Label htmlFor={`title-${section.id}`}>Bölüm adı</Label>
        <Input
          id={`title-${section.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="w-28 space-y-1.5">
        <Label htmlFor={`count-${section.id}`}>{unitLabel} sayısı</Label>
        <Input
          id={`count-${section.id}`}
          type="number"
          min={1}
          max={200}
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>
      <Button size="sm" disabled={isPending || !dirty} onClick={save}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save />}
        Kaydet
      </Button>
      <Button size="sm" variant="ghost" disabled={isPending} onClick={remove}>
        <Trash2 />
        Sil
      </Button>
    </div>
  )
}

function NewSectionForm({ bookId, unitLabel }: { bookId: string; unitLabel: string }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [count, setCount] = useState('5')
  const [isPending, startTransition] = useTransition()

  function add() {
    startTransition(async () => {
      const r = await addSectionAction(bookId, title, Number(count))
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success('Bölüm eklendi.')
      setTitle('')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-3">
      <div className="min-w-48 flex-1 space-y-1.5">
        <Label htmlFor="new-section-title">Yeni bölüm adı</Label>
        <Input
          id="new-section-title"
          placeholder="Örn: Türev"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="w-28 space-y-1.5">
        <Label htmlFor="new-section-count">{unitLabel} sayısı</Label>
        <Input
          id="new-section-count"
          type="number"
          min={1}
          max={200}
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      </div>
      <Button size="sm" variant="outline" disabled={isPending || !title.trim()} onClick={add}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus />}
        Bölüm ekle
      </Button>
    </div>
  )
}

// R4 §1B / §8: 2026 baskısı eklenirken 2025 kaydı ezilmemelidir. Kitabı
// bölüm/test yapısıyla kopyalar; öğrenci ilerlemesi kopyalanmaz.
function NewEditionCard({ bookId, currentYear }: { bookId: string; currentYear?: number | null }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [year, setYear] = useState<string>(currentYear ? String(currentYear + 1) : '')

  const submit = () => {
    const parsed = Number(year)
    if (!Number.isInteger(parsed)) {
      toast.error('Baskı yılı girin.')
      return
    }
    startTransition(async () => {
      const result = await duplicateBookAsEditionAction(bookId, parsed)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success('Yeni baskı oluşturuldu.')
      if (result.bookId) router.push(`/teacher/books/${result.bookId}`)
      else router.push('/teacher/books')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Yeni baskı oluştur</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Bu kitabı bölüm ve test yapısıyla kopyalar, yalnızca baskı yılı değişir.
          Mevcut kayıt ve öğrenci ilerlemesi olduğu gibi kalır.
        </p>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="newEditionYear">Yeni baskı yılı</Label>
            <Input
              id="newEditionYear"
              type="number"
              className="w-32"
              min={EDITION_YEAR_MIN}
              max={EDITION_YEAR_MAX}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" onClick={submit} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Copy />}
            Yeni baskı oluştur
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// R4 §2A/§3: sayfa takipli kitapta bölüm "adı + başlangıç sayfası + bitiş
// sayfası + isteğe bağlı kısa not" ile tanımlanır. Kur/etkinlik/test türleri
// ayrı bir veri modeli değildir; gerekirse nota insan dilinde yazılır.
function NewPageSectionForm({ bookId }: { bookId: string }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [pageStart, setPageStart] = useState('')
  const [pageEnd, setPageEnd] = useState('')
  const [note, setNote] = useState('')
  const [isPending, startTransition] = useTransition()

  const add = () => {
    startTransition(async () => {
      const r = await addPageSectionAction(
        bookId,
        title,
        Number(pageStart),
        Number(pageEnd),
        note || undefined
      )
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success('Bölüm eklendi.')
      setTitle('')
      setPageStart('')
      setPageEnd('')
      setNote('')
      router.refresh()
    })
  }

  const valid = title.trim() !== '' && Number(pageStart) >= 1 && Number(pageEnd) >= Number(pageStart)

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="new-page-section-title">Yeni bölüm adı</Label>
          <Input
            id="new-page-section-title"
            placeholder="Örn: Üçgenler"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="w-28 space-y-1.5">
          <Label htmlFor="new-page-start">Başlangıç sf.</Label>
          <Input
            id="new-page-start"
            type="number"
            min={1}
            value={pageStart}
            onChange={(e) => setPageStart(e.target.value)}
          />
        </div>
        <div className="w-28 space-y-1.5">
          <Label htmlFor="new-page-end">Bitiş sf.</Label>
          <Input
            id="new-page-end"
            type="number"
            min={1}
            value={pageEnd}
            onChange={(e) => setPageEnd(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-page-note">Bölüm notu (isteğe bağlı)</Label>
        <Input
          id="new-page-note"
          placeholder="Konu anlatımı + uygulama + ileri seviye çalışmalar"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <Button size="sm" variant="outline" disabled={isPending || !valid} onClick={add}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus />}
        Bölüm ekle
      </Button>
    </div>
  )
}
