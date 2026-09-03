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
  setSectionTopicsAction,
  setSectionPageRangeAction,
  setSectionPartAction,
  setBookTrackingModeAction,
  addBookPartAction,
  renameBookPartAction,
  deleteBookPartAction,
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
import { TopicMultiSelect, type TopicOption } from '@/components/shared/topic-multi-select'
import { unitLabel } from '@/lib/unit-labels'
import {
  SUBJECTS,
  LEVEL_EXAMS,
  VIDEO_MODE_OPTIONS,
  RESOURCE_TYPE_OPTIONS,
  STRUCTURE_KIND_OPTIONS,
  TRACKING_MODE_OPTIONS,
  EDITION_YEAR_MIN,
  EDITION_YEAR_MAX,
  CURRICULUM_PROGRAM_OPTIONS,
  videoUrlIsProminent,
} from '@/lib/book-taxonomy'

const schema = z.object({
  title: z.string().min(2, 'Kitap adı en az 2 karakter olmalı'),
  subject: z.string().min(1, 'Ders seçin'),
  publisher: z.string().optional(),
  levelExam: z.string().optional(),
  curriculumProgram: z.string().optional(),
  editionYear: z.number().int().min(EDITION_YEAR_MIN).max(EDITION_YEAR_MAX).optional().or(z.nan()),
  resourceType: z.string().optional(),
  structureKind: z.enum(['single', 'multi']),
  description: z.string().optional(),
  videoMode: z.string(),
  videoUrl: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export interface SectionRow {
  id: string
  title: string
  testCount: number
  /** R6-17 etiketleri. Artık DÜZENLENMEZ (R7-02 §6.4): yerini gerçek Parça
   *  nesnesi aldı. Eski kayıtlarda okunur ipucu olarak gösterilir ki
   *  öğretmen bilgiyi Parça'ya taşıyabilsin. */
  groupLabel: string | null
  themeLabel: string | null
  /** R7-02 §6.4: bölümün bağlı olduğu Parça; tek parçalı kaynakta null. */
  partId: string | null
  /** R4/022: sayfa takipli kitapta bölümün fiziksel kapsamı. */
  pageStart: number | null
  pageEnd: number | null
  /** R7-02 §8: bölüm birden fazla müfredat konusuna bağlanabilir. */
  topicIds: string[]
}

export interface PartRow {
  id: string
  title: string
}

export type { TopicOption }

interface Props {
  bookId: string
  defaultValues: FormData
  sections: SectionRow[]
  /** R7-02 §6.4: kaynağın parçaları (fasikül/cilt/modül). */
  parts: PartRow[]
  trackingMode: string
  /** R7-02 §8: kitabın ders/seviyesine göre FİLTRELENMİŞ konu listesi. */
  topics: TopicOption[]
  /** Liste gerçekten filtrelenebildi mi? Eşleşen kapsam yoksa tüm konular
   *  gösterilir ve kullanıcı bunu bilmelidir. */
  topicsFiltered: boolean
  /**
   * R7-02 §6.5: kaynakta ödev veya aktif tamamlama kaydı var mı?
   *
   * Yapısal alanların (takip türü, sayfa aralığı) kilidi buna bakar.
   * İlerleme yoksa yarım kalmış kayıt tamamen düzeltilebilir; başladıysa
   * ilerlemenin anlamını bozacak alanlar kilitlenir, isim/açıklama/video
   * gibi güvenli alanlar düzenlenmeye devam eder.
   */
  hasProgress: boolean
}

export function BookEditForm({
  bookId,
  defaultValues,
  sections,
  parts,
  trackingMode,
  topics,
  topicsFiltered,
  hasProgress,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // R6-01/R7-02 §6.5: birim adı takip türünden gelir (test/sayfa/bölüm/
  // adım/deneme). Etiketin tek kaynağı lib/unit-labels.ts.
  const unit = unitLabel(trackingMode)
  const unitTitle = unit.charAt(0).toLocaleUpperCase('tr') + unit.slice(1)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  const isMultiPart = watch('structureKind') === 'multi'
  const videoUrlProminent = videoUrlIsProminent(watch('videoMode'))

  // R7-02 §6.5: Enter tuşu formu kaydetmemeli — yarım kayıtların başlıca
  // sebebi buydu. Kayıt yalnız Kaydet butonuyla.
  function blockEnterSubmit(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter') return
    const target = event.target as HTMLElement
    if (target.tagName === 'TEXTAREA') return
    event.preventDefault()
  }

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      const result = await updateBookAction(bookId, {
        title: data.title,
        subject: data.subject,
        publisher: data.publisher || undefined,
        levelExam: data.levelExam || undefined,
        curriculumProgram: data.curriculumProgram || undefined,
        editionYear: Number.isFinite(data.editionYear) ? (data.editionYear as number) : null,
        resourceType: data.resourceType || undefined,
        structureKind: data.structureKind,
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
          <form onSubmit={handleSubmit(onSubmit)} onKeyDown={blockEnterSubmit} className="space-y-4">
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

            {/* R6-14: öğretim programı (TYMM geçişi). */}
            <div className="space-y-1.5">
              <Label htmlFor="curriculumProgram">Öğretim Programı</Label>
              <NativeSelect id="curriculumProgram" {...register('curriculumProgram')}>
                {CURRICULUM_PROGRAM_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
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

            {/* R7-02 §6.2-6.3: Kaynak Türü ve Kaynak Yapısı. */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="resourceType">Kaynak Türü</Label>
                <NativeSelect id="resourceType" {...register('resourceType')}>
                  {RESOURCE_TYPE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="structureKind">Kaynak Yapısı</Label>
                <NativeSelect id="structureKind" {...register('structureKind')}>
                  {STRUCTURE_KIND_OPTIONS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="videoMode">Video Kullanımı</Label>
                {/* R7-02 §7.1: "video var mı?" değil "video NASIL kullanılıyor?".
                    Eski book/section değerleri listede kalır ki mevcut kayıt
                    kendi değerini göstersin. */}
                <NativeSelect id="videoMode" {...register('videoMode')}>
                  {VIDEO_MODE_OPTIONS.filter(
                    (v) => !v.legacy || v.value === defaultValues.videoMode
                  ).map((v) => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="videoUrl">Video Bağlantısı</Label>
                <Input id="videoUrl" placeholder="Kanal veya oynatma listesi" {...register('videoUrl')} />
                {videoUrlProminent && (
                  <p className="text-xs text-muted-foreground">
                    Video ders akışında bağlantı çalışmanın parçasıdır.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Açıklama</Label>
              <Textarea id="description" rows={2} {...register('description')} />
            </div>

            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save />}
              Kaydet
            </Button>
          </form>
        </CardContent>
      </Card>

      <TrackingModeCard
        bookId={bookId}
        trackingMode={trackingMode}
        hasProgress={hasProgress}
      />

      {isMultiPart && <PartsCard bookId={bookId} parts={parts} />}

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
              unitTitle={unitTitle}
              isPageBook={trackingMode === 'page'}
              parts={isMultiPart ? parts : []}
              topics={topics}
              topicsFiltered={topicsFiltered}
              hasProgress={hasProgress}
            />
          ))}

          {trackingMode === 'page' ? (
            <NewPageSectionForm bookId={bookId} />
          ) : (
            <NewSectionForm bookId={bookId} unitTitle={unitTitle} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Takip türü düzeltmesi (R7-02 §6.5, kabul #1).
 *
 * R4-R6 boyunca bu alan tamamen kilitliydi ve "0 öğrencili yarım 3D VDD
 * kaydı bile takip yapısını değiştiremiyor" şikâyetini doğurdu. Kilidin
 * gerekçesi (mevcut tamamlama kayıtlarının anlamı bozulur) yalnız ilerleme
 * VARKEN geçerlidir; bu yüzden kilit kaldırılmıyor, daraltılıyor.
 */
function TrackingModeCard({
  bookId,
  trackingMode,
  hasProgress,
}: {
  bookId: string
  trackingMode: string
  hasProgress: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState(trackingMode)
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const r = await setBookTrackingModeAction(bookId, mode)
      if (r?.error) {
        toast.error(r.error)
        setMode(trackingMode)
        return
      }
      toast.success('Takip türü güncellendi.')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Takip türü</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64 space-y-1.5">
            <Label htmlFor="trackingMode">Takip Türü</Label>
            <NativeSelect
              id="trackingMode"
              value={mode}
              disabled={hasProgress}
              onChange={(e) => setMode(e.target.value)}
            >
              {TRACKING_MODE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </NativeSelect>
          </div>
          {!hasProgress && (
            <Button size="sm" disabled={isPending || mode === trackingMode} onClick={save}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save />}
              Takip türünü değiştir
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {hasProgress
            ? 'Bu kaynakta ödev veya tamamlama kaydı var. Takip türünü değiştirmek mevcut ilerlemenin anlamını bozacağı için kilitli; isim, açıklama ve video alanları düzenlenebilir.'
            : 'Bu kaynakta henüz ilerleme yok. Takip türünü değiştirirseniz mevcut birim satırları yeniden kurulur; bölüm adları korunur.'}
        </p>
      </CardContent>
    </Card>
  )
}

/**
 * Parça yönetimi (R7-02 §6.4).
 *
 * MÖF F1-F5 gibi fasiküller ayrı kitap açılmadan aynı kaynağın altında
 * durur. Parça bir GRUPLAMA katmanıdır: öğrencide tek plan, tek toplam
 * ilerleme yüzdesi korunur.
 */
function PartsCard({ bookId, parts }: { bookId: string; parts: PartRow[] }) {
  const router = useRouter()
  const [newTitle, setNewTitle] = useState('')
  const [isPending, startTransition] = useTransition()

  function add() {
    startTransition(async () => {
      const r = await addBookPartAction(bookId, newTitle)
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success('Parça eklendi.')
      setNewTitle('')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Parçalar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Fasikül, cilt veya modül. Bölümler aşağıda bir parçaya bağlanır.
          Parçayı silmek bölümleri silmez, yalnız parçasız bırakır.
        </p>

        {parts.map((part) => (
          <PartRowForm key={part.id} bookId={bookId} part={part} />
        ))}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-3">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor="new-part-title">Yeni parça adı</Label>
            <Input
              id="new-part-title"
              placeholder="Örn: F1 Sayılar"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </div>
          <Button size="sm" variant="outline" disabled={isPending || !newTitle.trim()} onClick={add}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus />}
            Parça ekle
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PartRowForm({ bookId, part }: { bookId: string; part: PartRow }) {
  const router = useRouter()
  const [title, setTitle] = useState(part.title)
  const [isPending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const r = await renameBookPartAction(bookId, part.id, title)
      if (r?.error) {
        toast.error(r.error)
        setTitle(part.title)
        return
      }
      toast.success('Parça güncellendi.')
      router.refresh()
    })
  }

  function remove() {
    startTransition(async () => {
      const r = await deleteBookPartAction(bookId, part.id)
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success('Parça silindi; bölümleri parçasız kaldı.')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="min-w-48 flex-1 space-y-1.5">
        <Label htmlFor={`part-${part.id}`}>Parça adı</Label>
        <Input
          id={`part-${part.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <Button size="sm" disabled={isPending || title === part.title} onClick={save}>
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

function SectionRowForm({
  bookId,
  section,
  unitTitle,
  isPageBook,
  parts,
  topics,
  topicsFiltered,
  hasProgress,
}: {
  bookId: string
  section: SectionRow
  unitTitle: string
  isPageBook: boolean
  parts: PartRow[]
  topics: TopicOption[]
  topicsFiltered: boolean
  hasProgress: boolean
}) {
  const router = useRouter()
  const [title, setTitle] = useState(section.title)
  const [count, setCount] = useState(String(section.testCount))
  const [partId, setPartId] = useState(section.partId ?? '')
  // R7-02 §6.5 kabul #2: sayfa aralığı 022'den beri saklanıyordu; eksik olan
  // düzenleme yoluydu. "84-96" girilen bölüm burada 84 / 96 olarak görünür.
  const [pageStart, setPageStart] = useState(section.pageStart ? String(section.pageStart) : '')
  const [pageEnd, setPageEnd] = useState(section.pageEnd ? String(section.pageEnd) : '')
  // R7-02 §8: çoklu eşleme. Boş liste eşlemeyi kaldırır.
  const [topicIds, setTopicIds] = useState<string[]>(section.topicIds)
  const [isPending, startTransition] = useTransition()

  const pageRangeChanged =
    isPageBook &&
    (Number(pageStart) || 0) !== (section.pageStart ?? 0) &&
    Number(pageStart) >= 1 &&
    Number(pageEnd) >= Number(pageStart)
  const pageEndChanged =
    isPageBook && (Number(pageEnd) || 0) !== (section.pageEnd ?? 0) && Number(pageEnd) >= 1

  const topicsChanged =
    topicIds.length !== section.topicIds.length ||
    topicIds.some((id) => !section.topicIds.includes(id))

  const dirty =
    title !== section.title ||
    (!isPageBook && Number(count) !== section.testCount) ||
    partId !== (section.partId ?? '') ||
    pageRangeChanged ||
    pageEndChanged ||
    topicsChanged

  function save() {
    startTransition(async () => {
      if (title !== section.title) {
        const r = await renameSectionAction(bookId, section.id, title)
        if (r?.error) {
          toast.error(r.error)
          return
        }
      }
      if (!isPageBook && Number(count) !== section.testCount) {
        const r = await setSectionTestCountAction(bookId, section.id, Number(count))
        if (r?.error) {
          // Kullanılmış birim silinemez — RPC'nin Türkçe mesajı burada görünür.
          toast.error(r.error)
          setCount(String(section.testCount))
          return
        }
      }
      if (isPageBook && (pageRangeChanged || pageEndChanged)) {
        const r = await setSectionPageRangeAction(
          bookId,
          section.id,
          Number(pageStart),
          Number(pageEnd)
        )
        if (r?.error) {
          toast.error(r.error)
          setPageStart(section.pageStart ? String(section.pageStart) : '')
          setPageEnd(section.pageEnd ? String(section.pageEnd) : '')
          return
        }
      }
      if (partId !== (section.partId ?? '')) {
        const r = await setSectionPartAction(bookId, section.id, partId || null)
        if (r?.error) {
          toast.error(r.error)
          return
        }
      }
      if (topicsChanged) {
        const r = await setSectionTopicsAction(bookId, section.id, topicIds)
        if (r?.error) {
          toast.error(r.error)
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

  // R6-17'den kalan serbest metin etiketleri. Artık düzenlenmiyor; yalnız
  // öğretmen bilgiyi Parça'ya taşıyabilsin diye gösteriliyor (§11: eski
  // değerler kör otomasyonla dönüştürülmez).
  const legacyLabels = [section.groupLabel, section.themeLabel].filter(Boolean).join(' · ')

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor={`title-${section.id}`}>Bölüm adı</Label>
          <Input
            id={`title-${section.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {parts.length > 0 && (
          <div className="w-44 space-y-1.5">
            <Label htmlFor={`part-select-${section.id}`}>Parça</Label>
            <NativeSelect
              id={`part-select-${section.id}`}
              value={partId}
              onChange={(e) => setPartId(e.target.value)}
            >
              <option value="">Parçasız</option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </NativeSelect>
          </div>
        )}

        {isPageBook ? (
          <>
            <div className="w-24 space-y-1.5">
              <Label htmlFor={`page-start-${section.id}`}>Başlangıç sf.</Label>
              <Input
                id={`page-start-${section.id}`}
                type="number"
                min={1}
                value={pageStart}
                disabled={hasProgress}
                onChange={(e) => setPageStart(e.target.value)}
              />
            </div>
            <div className="w-24 space-y-1.5">
              <Label htmlFor={`page-end-${section.id}`}>Bitiş sf.</Label>
              <Input
                id={`page-end-${section.id}`}
                type="number"
                min={1}
                value={pageEnd}
                disabled={hasProgress}
                onChange={(e) => setPageEnd(e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="w-28 space-y-1.5">
            <Label htmlFor={`count-${section.id}`}>{unitTitle} sayısı</Label>
            <Input
              id={`count-${section.id}`}
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
        )}

        <Button size="sm" disabled={isPending || !dirty} onClick={save}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save />}
          Kaydet
        </Button>
        <Button size="sm" variant="ghost" disabled={isPending} onClick={remove}>
          <Trash2 />
          Sil
        </Button>
      </div>

      {legacyLabels && (
        <p className="text-xs text-muted-foreground">
          Eski etiket: {legacyLabels} — bu bilgiyi yukarıdaki Parça alanına taşıyabilirsiniz.
        </p>
      )}

      <div className="space-y-1.5">
        <Label>Müfredat konuları</Label>
        <TopicMultiSelect
          topics={topics}
          selectedIds={topicIds}
          onChange={setTopicIds}
          filtered={topicsFiltered}
        />
      </div>
    </div>
  )
}

function NewSectionForm({ bookId, unitTitle }: { bookId: string; unitTitle: string }) {
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
        <Label htmlFor="new-section-count">{unitTitle} sayısı</Label>
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
