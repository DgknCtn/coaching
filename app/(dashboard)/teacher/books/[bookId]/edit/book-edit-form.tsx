'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  updateBookAction,
  renameSectionAction,
  setSectionTestCountAction,
  addSectionAction,
  deleteSectionAction,
} from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EXAM_TYPE_OPTIONS, SUBJECTS } from '@/lib/validation'

const schema = z.object({
  title: z.string().min(2, 'Kitap adı en az 2 karakter olmalı'),
  subject: z.string().min(1, 'Ders seçin'),
  publisher: z.string().optional(),
  examType: z.string().optional(),
  description: z.string().optional(),
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
      const result = await updateBookAction(
        bookId,
        data.title,
        data.subject,
        data.publisher || undefined,
        data.examType || undefined,
        data.description || undefined
      )
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
                <Label htmlFor="examType">Sınav Türü</Label>
                <NativeSelect id="examType" {...register('examType')}>
                  <option value="">Seçin</option>
                  {EXAM_TYPE_OPTIONS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </NativeSelect>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="publisher">Yayın</Label>
              <Input id="publisher" {...register('publisher')} />
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

          <NewSectionForm bookId={bookId} unitLabel={unitLabel} />
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
