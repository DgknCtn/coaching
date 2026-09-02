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
import { NativeSelect } from '@/components/ui/native-select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  SUBJECTS,
  LEVEL_EXAMS,
  TRACKING_MODE_OPTIONS,
  VIDEO_MODE_OPTIONS,
  RESOURCE_TYPE_OPTIONS,
  STRUCTURE_KIND_OPTIONS,
  EDITION_YEAR_MIN,
  EDITION_YEAR_MAX,
  CURRICULUM_PROGRAM_OPTIONS,
  videoUrlIsProminent,
} from '@/lib/book-taxonomy'

const sectionSchema = z.object({
  title: z.string().min(1, 'Bölüm adı gerekli'),
  // R7-02 §6.4: çok parçalı kaynakta bölümün bağlı olduğu Parça.
  part: z.string().optional(),
  test_count: z.number().int().min(1, 'En az 1 test').max(200).optional().or(z.nan()),
  page_start: z.number().int().min(1).optional().or(z.nan()),
  page_end: z.number().int().min(1).optional().or(z.nan()),
  note: z.string().optional(),
})

const schema = z.object({
  title: z.string().min(2, 'Kitap adı gerekli'),
  subject: z.string().min(1, 'Ders seçimi gerekli'),
  levelExam: z.string().min(1, 'Seviye / sınav türü gerekli'),
  curriculumProgram: z.string().optional(),
  publisher: z.string().optional(),
  editionYear: z.number().int().min(EDITION_YEAR_MIN).max(EDITION_YEAR_MAX).optional().or(z.nan()),
  resourceType: z.string().min(1, 'Kaynak türü gerekli'),
  structureKind: z.enum(['single', 'multi']),
  trackingMode: z.enum(['test', 'page', 'section', 'step', 'trial']),
  description: z.string().optional(),
  videoMode: z.enum(['none', 'solution_videos', 'video_course', 'mixed', 'book', 'section']),
  videoUrl: z.string().optional(),
  termId: z.string().optional(),
  sections: z.array(sectionSchema).min(1, 'En az 1 bölüm ekleyin'),
})

type FormData = z.infer<typeof schema>


interface Props {
  terms: { id: string; name: string }[]
  defaultTermId: string
}

export function BookForm({ terms, defaultTermId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, control, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      termId: defaultTermId,
      resourceType: 'Belirtilmedi',
      structureKind: 'single',
      trackingMode: 'test',
      videoMode: 'none',
      sections: [{ title: '', test_count: 1, note: '', part: '' }],
      // trackingMode 'page' seçilirse aşağıdaki bölüm satırları sayfa
      // aralığı ister; test sayısı alanı gizlenir.
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'sections' })

  // Sayfa takipli kitapta bölüm, test sayısıyla değil fiziksel kapsamıyla
  // tanımlanır: "Üçgenler | sf. 1-78" (R4 §3).
  const isPageBook = watch('trackingMode') === 'page'
  // R7-02 §6.3: çok parçalı kaynakta her bölüm bir Parça'ya (fasikül/cilt)
  // bağlanır. MÖF F1-F5 böylece ayrı kitap açılmadan tek kaynakta durur.
  const isMultiPart = watch('structureKind') === 'multi'
  const videoUrlProminent = videoUrlIsProminent(watch('videoMode'))

  // R7-02 §6.5: Enter tuşu formu KAYDETMEMELİ. Bölüm satırlarında gezinirken
  // yanlışlıkla yarım kitap kaydı oluşmasının başlıca sebebi buydu; kayıt
  // yalnız "Kitabı Kaydet" butonuyla yapılır. Textarea'da Enter satır
  // sonudur, bu yüzden orada engellenmez.
  function blockEnterSubmit(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter') return
    const target = event.target as HTMLElement
    if (target.tagName === 'TEXTAREA') return
    event.preventDefault()
  }

  const onSubmit = (data: FormData) => {
    setServerError(null)
    startTransition(async () => {
      const result = await createBookAction({
        title: data.title,
        subject: data.subject,
        publisher: data.publisher,
        levelExam: data.levelExam,
        curriculumProgram: data.curriculumProgram || 'Belirtilmedi',
        // Boş bırakılan sayı alanı NaN gelir; sunucuya null gitmeli.
        editionYear: Number.isFinite(data.editionYear) ? (data.editionYear as number) : null,
        description: data.description,
        trackingMode: data.trackingMode,
        videoMode: data.videoMode,
        videoUrl: data.videoUrl,
        termId: data.termId,
        resourceType: data.resourceType,
        structureKind: data.structureKind,
        sections: data.sections.map((s) => ({
          title: s.title,
          // Tek parçalı kaynakta parça adı hiç gönderilmez.
          part: isMultiPart ? s.part?.trim() || undefined : undefined,
          // Sayfa kitabında birim sayısı sayfa aralığından türetilir; test
          // kitabında girilen test sayısı kullanılır.
          test_count: isPageBook ? 0 : Number(s.test_count) || 0,
          note: s.note,
          page_start: isPageBook && Number.isFinite(s.page_start) ? (s.page_start as number) : null,
          page_end: isPageBook && Number.isFinite(s.page_end) ? (s.page_end as number) : null,
        })),
      })
      if (result?.error) {
        setServerError(result.error)
      } else {
        router.push('/teacher/books')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} onKeyDown={blockEnterSubmit} className="space-y-6">
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
              <NativeSelect
                id="subject"
                {...register('subject')}
              >
                <option value="">Seçin</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </NativeSelect>
              {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="levelExam">Seviye / Sınav Türü *</Label>
              <NativeSelect
                id="levelExam"
                aria-invalid={!!errors.levelExam}
                {...register('levelExam')}
              >
                <option value="">Seçin</option>
                {LEVEL_EXAMS.map(l => <option key={l} value={l}>{l}</option>)}
              </NativeSelect>
              {errors.levelExam && <p className="text-xs text-destructive">{errors.levelExam.message}</p>}
            </div>
          </div>

          {/* R6-14: kaynağın hangi müfredata göre üretildiği, seviye/sınav
              bilgisinden BAĞIMSIZ bir alandır. Varsayılan "Belirtilmedi";
              zorunlu değildir ve mevcut akışı ağırlaştırmaz. */}
          <div className="space-y-1.5">
            <Label htmlFor="curriculumProgram">Öğretim Programı</Label>
            <NativeSelect id="curriculumProgram" {...register('curriculumProgram')}>
              {CURRICULUM_PROGRAM_OPTIONS.map(c => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="publisher">Yayın</Label>
              <Input id="publisher" placeholder="Bilgi Sarmal" {...register('publisher')} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editionYear">Baskı Yılı</Label>
              <Input
                id="editionYear"
                type="number"
                min={EDITION_YEAR_MIN}
                max={EDITION_YEAR_MAX}
                placeholder="2026"
                {...register('editionYear', { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Aynı kitabın farklı baskıları ayrı kayıt olarak tutulur.
              </p>
            </div>
          </div>

          {/* R7-02 §6.2-6.3: Kaynak Türü ve Kaynak Yapısı, Baskı Yılı ile
              Takip Türü arasında durur. Tür yalnız sınıflama/filtre içindir;
              aynı türden ikinci kitabı engellemez. */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="resourceType">Kaynak Türü *</Label>
              <NativeSelect id="resourceType" {...register('resourceType')}>
                {RESOURCE_TYPE_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="structureKind">Kaynak Yapısı *</Label>
              <NativeSelect id="structureKind" {...register('structureKind')}>
                {STRUCTURE_KIND_OPTIONS.map(k => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                MÖF, Kondisyon gibi fasiküllü kaynaklar için Çok Parçalı seçin.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trackingMode">Takip Türü *</Label>
            <NativeSelect
              id="trackingMode"
              {...register('trackingMode')}
            >
              {TRACKING_MODE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </NativeSelect>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="videoMode">Video Kullanımı</Label>
              {/* R7-02 §7.1: soru bankasının çözüm videosu ile VDD'nin ders
                  akışı aynı şey değildir; ayrım burada yapılır. Eski
                  kayıtların değerleri "(eski)" olarak listede kalır. */}
              <NativeSelect id="videoMode" {...register('videoMode')}>
                {VIDEO_MODE_OPTIONS.filter(v => !v.legacy).map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="videoUrl">Video Bağlantısı</Label>
              <Input id="videoUrl" placeholder="Kanal veya oynatma listesi" {...register('videoUrl')} />
              {videoUrlProminent && (
                <p className="text-xs text-muted-foreground">
                  Video ders akışında bağlantı çalışmanın parçasıdır; oynatma
                  listesini eklemeniz önerilir.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Açıklama</Label>
            <Textarea id="description" rows={2} {...register('description')} />
          </div>

          {terms.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="termId">Dönem</Label>
              <NativeSelect
                id="termId"
                {...register('termId')}
              >
                {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </NativeSelect>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sections */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">{isMultiPart ? 'Parçalar ve Bölümler' : 'Bölümler'}</h2>
          <p className="text-xs text-muted-foreground">
            Toplam: {fields.length} bölüm
          </p>
        </div>

        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2 items-start">
              <div className="flex-1 flex gap-2">
                {isMultiPart && (
                  <Input
                    className="w-32 shrink-0"
                    placeholder="Parça (F1)"
                    {...register(`sections.${index}.part`)}
                  />
                )}
                <Input
                  placeholder={`Bölüm ${index + 1} adı`}
                  aria-invalid={!!errors.sections?.[index]?.title}
                  {...register(`sections.${index}.title`)}
                />
                {isPageBook ? (
                  <>
                    <Input
                      type="number"
                      min={1}
                      className="w-24 shrink-0"
                      placeholder="Baş. sf."
                      {...register(`sections.${index}.page_start`, { valueAsNumber: true })}
                    />
                    <Input
                      type="number"
                      min={1}
                      className="w-24 shrink-0"
                      placeholder="Bitiş sf."
                      aria-invalid={!!errors.sections?.[index]?.page_end}
                      {...register(`sections.${index}.page_end`, { valueAsNumber: true })}
                    />
                  </>
                ) : (
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    className="w-24 shrink-0"
                    placeholder="Test"
                    aria-invalid={!!errors.sections?.[index]?.test_count}
                    {...register(`sections.${index}.test_count`, { valueAsNumber: true })}
                  />
                )}
                <Input
                  className="flex-1"
                  placeholder="Not (isteğe bağlı)"
                  {...register(`sections.${index}.note`)}
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
          onClick={() => append({ title: '', test_count: 1, note: '', part: '' })}
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
