'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Save, Split, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { canConvertToSubsections, testCountFromRange } from '@/lib/book-structure'
import {
  addSubsectionAction,
  convertSectionToSubsectionsAction,
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
  usedTestCount,
  hasProgress,
}: {
  bookId: string
  sectionId: string
  subsections: SubsectionRow[]
  /** Bölümün KENDİ testleri. Varsa önce dönüştürme gerekir. */
  sectionTestCount: number
  /** Bu testlerden kaçı ödevde veya tamamlama kaydında kullanılmış. */
  usedTestCount: number
  hasProgress: boolean
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [isPending, startTransition] = useTransition()

  const newCount = testCountFromRange(Number(start) || null, Number(end) || null)

  // BÖLÜMÜN KENDİ TESTLERİ VARSA: doğrudan ekleme yerine DÖNÜŞTÜRME.
  //
  // 076 öncesinde burada yalnız bir uyarı vardı ve "önce bölümün test
  // sayısını sıfırlayın" diyordu — yapılamayan bir iş. Artık aynı form
  // dönüştürme düğmesiyle çalışıyor; karar lib/book-structure.ts'teki
  // saf kontrolden geliyor ki RPC ile aynı şeyi söylesin.
  const needsConversion = subsections.length === 0 && sectionTestCount > 0
  const convertCheck = canConvertToSubsections({
    sectionTestCount,
    usedTestCount,
    // Bu bileşen sayfa kitabında zaten hiç render edilmiyor
    // (book-edit-form.tsx: {!isPageBook && ...}).
    isPageBook: false,
    hasSubsections: subsections.length > 0,
  })

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

  /**
   * Bölümü alt bölümlere ayırır.
   *
   * YIKICI: bölümün mevcut testleri kaldırılır. Bu yüzden onay isteniyor
   * ve kaç testin gideceği cümlede yazıyor — "N test" soyut bir sayı
   * değil, öğretmenin kitaba girdiği iş.
   */
  function convert() {
    startTransition(async () => {
      if (
        !window.confirm(
          `Bölümün mevcut ${sectionTestCount} testi kaldırılacak ve yerine ` +
            `"${title}" alt bölümü kurulacak. Devam edilsin mi?`
        )
      ) {
        return
      }
      const r = await convertSectionToSubsectionsAction(
        bookId,
        sectionId,
        title,
        Number(start),
        Number(end)
      )
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success('Bölüm alt bölümlere ayrıldı.')
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

      {needsConversion && (
        <p className="rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning-foreground">
          {convertCheck.ok ? (
            <>
              Bu bölümün kendi {sectionTestCount} testi var. Aynı bölümde iki ayrı test
              kaynağı olamaz; aşağıdaki alt bölüm kurulurken bu testler kaldırılır.
            </>
          ) : (
            convertCheck.message
          )}
        </p>
      )}

      {needsConversion && !convertCheck.ok ? null : (
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
          {/* Aynı form iki işi görür: bölümün kendi testleri varsa
              ekleme yerine DÖNÜŞTÜRME yapılır — alanlar birebir aynı
              olduğu için ikinci bir form kullanıcıya aynı şeyi iki
              kez sorardı. Düğmenin metni hangi işin yapılacağını
              söyler, çünkü dönüştürme testleri kaldırır. */}
          <Button
            size="sm"
            variant={needsConversion ? 'default' : 'outline'}
            disabled={isPending || !title.trim() || newCount === 0}
            onClick={needsConversion ? convert : add}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : needsConversion ? (
              <Split />
            ) : (
              <Plus />
            )}
            {needsConversion ? 'Alt bölümlere ayır' : 'Alt bölüm ekle'}
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
