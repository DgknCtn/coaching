'use client'

import { useState, useTransition } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { createBookAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const sectionSchema = z.object({
  title: z.string().min(1, 'Bölüm adı gerekli'),
  test_count: z.number().int().min(1, 'En az 1 test').max(200),
})

const schema = z.object({
  title: z.string().min(2, 'Kitap adı gerekli'),
  subject: z.string().min(1, 'Ders seçimi gerekli'),
  publisher: z.string().optional(),
  examType: z.string().optional(),
  description: z.string().optional(),
  termId: z.string().min(1),
  sections: z.array(sectionSchema).min(1, 'En az 1 bölüm ekleyin'),
})

type FormData = z.infer<typeof schema>

const SUBJECTS = ['Matematik', 'Türkçe', 'Fizik', 'Kimya', 'Biyoloji', 'Geometri', 'Tarih', 'Coğrafya', 'Edebiyat', 'İngilizce', 'Diğer']
const EXAM_TYPES = ['TYT', 'AYT', 'LGS', 'Other']

interface Props {
  terms: { id: string; name: string }[]
  defaultTermId: string
}

export function BookForm({ terms, defaultTermId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      termId: defaultTermId,
      sections: [{ title: '', test_count: 1 }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'sections' })

  const onSubmit = (data: FormData) => {
    setServerError(null)
    startTransition(async () => {
      const result = await createBookAction(
        data.title,
        data.subject,
        data.publisher,
        data.examType,
        data.description,
        data.termId,
        data.sections
      )
      if (result?.error) {
        setServerError(result.error)
      } else {
        router.push('/teacher/books')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Book info */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Kitap Adı *</Label>
            <Input id="title" placeholder="Bilgi Sarmal TYT Kimya" aria-invalid={!!errors.title} {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Ders *</Label>
              <select
                id="subject"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                {...register('subject')}
              >
                <option value="">Seçin</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="examType">Sınav Türü</Label>
              <select
                id="examType"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                {...register('examType')}
              >
                <option value="">Seçin</option>
                {EXAM_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publisher">Yayın</Label>
            <Input id="publisher" placeholder="Bilgi Sarmal" {...register('publisher')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Açıklama</Label>
            <Textarea id="description" rows={2} {...register('description')} />
          </div>

          {terms.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="termId">Dönem</Label>
              <select
                id="termId"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                {...register('termId')}
              >
                {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sections */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Bölümler</h2>
          <p className="text-xs text-muted-foreground">
            Toplam: {fields.reduce((sum, _, i) => sum, 0)} bölüm
          </p>
        </div>

        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2 items-start">
              <div className="flex-1 flex gap-2">
                <Input
                  placeholder={`Bölüm ${index + 1} adı`}
                  aria-invalid={!!errors.sections?.[index]?.title}
                  {...register(`sections.${index}.title`)}
                />
                <Input
                  type="number"
                  min={1}
                  max={200}
                  className="w-24 shrink-0"
                  placeholder="Test"
                  aria-invalid={!!errors.sections?.[index]?.test_count}
                  {...register(`sections.${index}.test_count`, { valueAsNumber: true })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(index)}
                disabled={fields.length === 1}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          {errors.sections && typeof errors.sections.message === 'string' && (
            <p className="text-xs text-destructive">{errors.sections.message}</p>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => append({ title: '', test_count: 1 })}
        >
          <Plus className="size-3.5" /> Bölüm Ekle
        </Button>
      </div>

      <Separator />

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          Kitabı Kaydet
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/teacher/books')}>
          İptal
        </Button>
      </div>
    </form>
  )
}
