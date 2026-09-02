'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  Copy,
  Check,
  Trash2,
  Send,
  CalendarDays,
  BookOpen,
  CircleCheck,
  UserRound,
  Hourglass,
  CircleAlert,
  CircleDashed,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { createHomeworkBatchAction } from './actions'
import { saveWeeklyPlanDraftAction, clearWeeklyPlanDraftAction } from './draft-actions'
import {
  approveUnitsAction,
  completeUnitsManuallyAction,
  revertUnitsAction,
} from '../../books/[bookId]/map-actions'
import { BookMapGrid } from '@/components/shared/book-map-grid'
import { BulkActionPanel } from '@/components/shared/bulk-action-panel'
import type { BookMapBook } from '@/lib/book-map'
import { isSelectableState, formatSelectedUnits } from '@/lib/book-map'
import { buildShareText } from '@/lib/share-text'
import { COUNTER_LABEL, todayDateString } from '@/lib/homework-status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { TempoStrip } from '@/components/shared/tempo-strip'
import { formatUnitCount, unitLabel } from '@/lib/unit-labels'
import { ProgressSummary } from '@/components/shared/progress-summary'
import { cn } from '@/lib/utils'

// Tek Kitap Haritası — öğretmenin kaynak üzerindeki ana çalışma yüzeyi
// (R7 / R6-03 güncellemesi).
//
// ÖNCESİ: aynı kitap verisi üzerinde İKİ ayrı çalışma bağlamı vardı — burada
// ödev sepeti (mode='plan'), kitap detayında Yönetim modu (mode='manage').
// Fonksiyonlar doğru çalışıyordu ama öğretmenin doğal akışını parçalıyordu:
// "ödev veriyorum" ile "yönetim yapıyorum" ayrı ekran mantıklarıydı.
//
// ŞİMDİ: tek harita, altı durum da seçilebilir; seçime göre uygun işlemler
// aktif olur. Kitap detayındaki harita salt görünüme indi ve buraya yönlendirir.
//
// İKİ AYRI KÜME (§1.2 güvenlik kuralı):
//   mapSelection — haritada seçili birimler. Bir kutuyu seçmek veri
//                  durumunu TEK BAŞINA değiştirmez; seçim yalnız yapılacak
//                  işlemin hedefidir.
//   basketIds    — "Ödeve Ekle" ile haftalık plan sepetine alınanlar. Durum
//                  ancak "Planı Yayınla" ile değişir. Taslak (019) bu kümeyi
//                  saklar.

interface SelectedTest {
  student_book_assignment_id: string
  book_test_id: string
  bookId: string
  bookTitle: string
  sectionId: string
  sectionTitle: string
  testTitle: string
  orderIndex: number
  trackingMode: string
}

interface Props {
  studentId: string
  termId: string
  workspaceId: string
  studentName: string
  books: BookMapBook[]
  /** R7: kitap detayından gelindiğinde harita bu kaynakta açılır. */
  initialBookId?: string
  /** 019 taslağından hidrate edilen seçimler (sayfa yenilemede korunur). */
  initialSelectedTestIds: string[]
  initialDueDate: string
  initialTitle: string
  initialNote: string
}

export function HomeworkBuilder({
  studentId,
  termId,
  workspaceId,
  studentName,
  books,
  initialBookId,
  initialSelectedTestIds,
  initialDueDate,
  initialTitle,
  initialNote,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeBookId, setActiveBookId] = useState(
    // R7: kitap detayından "Bu kitapta çalış" ile gelindiyse o kaynakta aç.
    () =>
      (initialBookId && books.some(b => b.bookId === initialBookId)
        ? initialBookId
        : books[0]?.bookId) ?? ''
  )
  const [dueDate, setDueDate] = useState(initialDueDate)
  const [title, setTitle] = useState(initialTitle)
  // Ödev notu (R6-05): ödev başına TEK isteğe bağlı alan.
  const [note, setNote] = useState(initialNote)
  const [serverError, setServerError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const dueDateRef = useRef<HTMLInputElement>(null)

  // Sepet kitap bileşeninin İÇİNDE değil, bu üst katmanda tutulur — eğitmen
  // kitaplar arasında dolaşırken plan kaybolmaz (R3 v2 §B) ve taslak (019)
  // sayfa yenilemesinde geri gelir.
  const [basketIds, setBasketIds] = useState<Set<string>>(
    () => new Set(initialSelectedTestIds)
  )

  // Harita seçimi sepetten AYRIDIR (R7 §1.2): seçim yapılacak işlemin
  // hedefini belirler, veriyi değiştirmez ve plana kendiliğinden girmez.
  const [mapSelection, setMapSelection] = useState<Set<string>>(new Set())

  // Test id → kitap/bölüm bağlamı. Sepet ve "metni kopyala" bunu kullanır.
  const testIndex = useMemo(() => {
    const index = new Map<string, SelectedTest>()
    for (const book of books) {
      for (const section of book.sections) {
        section.tests.forEach((test, position) => {
          index.set(test.id, {
            student_book_assignment_id: book.assignmentId,
            book_test_id: test.id,
            bookId: book.bookId,
            bookTitle: book.title,
            sectionId: section.id,
            // R7 §1.4: sayfa bazlı kaynakta bölüm adı TEK BAŞINA yetmez —
            // "5-25" hangi fasikülün sayfaları? Parça adı sepette ve
            // WhatsApp metninde bölüm başlığının önüne yazılır.
            sectionTitle: section.partTitle
              ? `${section.partTitle} | ${section.title}`
              : section.title,
            testTitle: test.title,
            // Test kitabında matristeki sütun numarası (1 tabanlı); sayfa
            // takipli kitapta birim tek bir fiziksel sayfadır (022), o zaman
            // gösterilen numara gerçek sayfa numarasıdır.
            orderIndex:
              book.trackingMode === 'page' && test.pageStart != null
                ? test.pageStart
                : position + 1,
            trackingMode: book.trackingMode,
          })
        })
      }
    }
    return index
  }, [books])

  // Sepetin içeriği: yayınlanacak ve WhatsApp metnine girecek olan küme.
  const selectedTests = useMemo(
    () =>
      [...basketIds]
        .map(id => testIndex.get(id))
        .filter((t): t is SelectedTest => Boolean(t)),
    [basketIds, testIndex]
  )

  const activeBook = books.find(b => b.bookId === activeBookId) ?? books[0]

  // Aktif kitabın metrikleri — hepsi mevcut harita verisinden sayılır, ek istek yok.
  const activeMetrics = useMemo(() => {
    if (!activeBook) return null
    let completed = 0
    let assigned = 0
    let pendingApproval = 0
    let overdue = 0
    for (const section of activeBook.sections) {
      for (const test of section.tests) {
        if (test.state === 'completed') completed++
        else if (test.state === 'pending_approval') pendingApproval++
        else if (test.state === 'overdue') overdue++
        else if (test.state === 'assigned' || test.state === 'returned') assigned++
      }
    }
    return {
      total: activeBook.totalTests,
      completed,
      assigned,
      pendingApproval,
      overdue,
      remaining: Math.max(0, activeBook.totalTests - completed),
    }
  }, [activeBook])

  // Haftalık planda hatırlatılacak video görevleri. Kitap veya bölüm
  // seviyesindeki video kaynağı, öğrenci-kitap tercihine göre mesaja
  // eklenir; hesap birimi değildir (R4 §6).
  const videoTasksByBookId = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const book of books) {
      if (book.videoMode === 'none') continue
      // Tercih "kaynak olarak göster" ise mesajda hatırlatma yapılmaz.
      if (book.videoDisplay !== 'weekly_reminder') continue
      const tasks =
        book.videoMode === 'book'
          ? [`${book.title} konu anlatım videolarını izle`]
          : book.sections
              .filter(s => s.videoUrl)
              .map(s => `${s.title} konu anlatım videolarını izle`)
      if (tasks.length > 0) map.set(book.bookId, tasks)
    }
    return map
  }, [books])

  // Kitap başlığı altında gruplanmış sepet ("Bu Haftanın Planı").
  const groupedSelection = useMemo(() => {
    const byBook = new Map<
      string,
      {
        bookId: string
        bookTitle: string
        trackingMode: string
        count: number
        sections: Map<string, { title: string; units: number[] }>
        videoTasks: string[]
      }
    >()
    for (const t of selectedTests) {
      const group = byBook.get(t.bookId) ?? {
        bookId: t.bookId,
        bookTitle: t.bookTitle,
        trackingMode: t.trackingMode,
        count: 0,
        sections: new Map<string, { title: string; units: number[] }>(),
        // Video plan temposuna girmez (R4 §6); yalnız mesajda hatırlatılır.
        videoTasks: videoTasksByBookId.get(t.bookId) ?? [],
      }
      group.count++
      const section = group.sections.get(t.sectionId) ?? { title: t.sectionTitle, units: [] }
      section.units.push(t.orderIndex)
      group.sections.set(t.sectionId, section)
      byBook.set(t.bookId, group)
    }
    return [...byBook.values()]
  }, [selectedTests])

  // Sepetteki kitaplar tek bir takip türünde toplanıyorsa o birimin adı
  // kullanılır (R6-01 kabul #3). Test ve sayfa kaynakları karışıksa tek bir
  // birim adı doğru olmaz; nötr "çalışma" denir.
  const basketUnitLabel = useMemo(() => {
    const modes = new Set(groupedSelection.map(g => g.trackingMode))
    return modes.size === 1 ? unitLabel([...modes][0]) : 'çalışma'
  }, [groupedSelection])

  // Taslağı debounce'lu kaydet. upsert_weekly_plan_draft idempotent olduğu
  // için aynı payload'ın iki kez gitmesi zararsızdır.
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const handle = setTimeout(() => {
      void saveWeeklyPlanDraftAction(
        workspaceId,
        studentId,
        dueDate || undefined,
        title || undefined,
        selectedTests.map(t => ({
          student_book_assignment_id: t.student_book_assignment_id,
          book_test_id: t.book_test_id,
        })),
        note || undefined
      )
    }, 500)
    return () => clearTimeout(handle)
  }, [selectedTests, dueDate, title, note, workspaceId, studentId])

  // Shift+tık aralık seçiminin çıpası: en son tıklanan hücre.
  const lastClickedRef = useRef<string | null>(null)

  const toggleTest = useCallback((_bookId: string, testId: string) => {
    lastClickedRef.current = testId
    setMapSelection(prev => {
      const next = new Set(prev)
      if (next.has(testId)) next.delete(testId)
      else next.add(testId)
      return next
    })
  }, [])

  const toggleSection = useCallback((_bookId: string, testIds: string[]) => {
    if (testIds.length === 0) return
    setMapSelection(prev => {
      const next = new Set(prev)
      const allSelected = testIds.every(id => next.has(id))
      for (const id of testIds) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }, [])

  // Shift+tık aralık seçimi: son tıklanan hücre ile hedef arasındaki
  // SEÇİLEBİLİR testler seçilir. Kitap sınırı aşılmaz.
  const selectRange = useCallback(
    (bookId: string, testId: string) => {
      const book = books.find(b => b.bookId === bookId)
      const anchor = lastClickedRef.current
      if (!book || !anchor) {
        toggleTest(bookId, testId)
        return
      }

      const flat = book.sections.flatMap(section => section.tests)
      const from = flat.findIndex(t => t.id === anchor)
      const to = flat.findIndex(t => t.id === testId)
      if (from === -1 || to === -1) {
        toggleTest(bookId, testId)
        return
      }

      const [start, end] = from <= to ? [from, to] : [to, from]
      // Birleşik yüzeyde altı durum da seçilebilir (R7): aralık seçimi de
      // yönetim modunun seçilebilirlik kuralını kullanır.
      const ids = flat
        .slice(start, end + 1)
        .filter(t => isSelectableState(t.state, 'manage'))
        .map(t => t.id)

      lastClickedRef.current = testId
      setMapSelection(prev => {
        const next = new Set(prev)
        for (const id of ids) next.add(id)
        return next
      })
    },
    [books, toggleTest]
  )

  const clearMapSelection = useCallback(() => setMapSelection(new Set()), [])

  /** Dar ekran listesi için: sepete ekle/çıkar. */
  function toggleBasket(testId: string) {
    setBasketIds(prev => {
      const next = new Set(prev)
      if (next.has(testId)) next.delete(testId)
      else next.add(testId)
      return next
    })
  }

  function clearBasket() {
    setBasketIds(new Set())
  }

  /**
   * "Ödeve Ekle" — seçimi haftalık plan sepetine taşır.
   *
   * VERİYE DOKUNMAZ: durum ancak "Planı Yayınla" ile değişir. Panel yalnız
   * uygun (henüz verilmemiş) birimleri gönderir; sayım lib/bulk-actions.ts'te.
   */
  function addToBasket(unitIds: string[]) {
    if (unitIds.length === 0) return
    setBasketIds(prev => {
      const next = new Set(prev)
      for (const id of unitIds) next.add(id)
      return next
    })
    clearMapSelection()
  }

  /**
   * Yönetim işlemleri (Onayla / Tamamlandı Olarak İşle / Geri Al).
   *
   * Aynı RPC'leri kitap detayındaki harita da kullanıyordu; işlem sonrası
   * router.refresh() ile harita durumları anında güncellenir (kabul R6-03.5).
   * Geri alma geçmişi fiziksel olarak silmez — kayıt 'reverted' işaretlenir.
   */
  function reportBulk(verb: string) {
    return (result: { error?: string; success?: boolean; result?: Record<string, number> }) => {
      if (result.error) toast.error(result.error)
      else {
        toast.success(`Seçili çalışmalar ${verb}.`)
        router.refresh()
      }
      return result
    }
  }

  function handleSubmit() {
    if (!dueDate || selectedTests.length === 0) return
    setServerError(null)
    startTransition(async () => {
      const result = await createHomeworkBatchAction(
        workspaceId,
        termId,
        studentId,
        dueDate,
        title || undefined,
        selectedTests.map(t => ({
          student_book_assignment_id: t.student_book_assignment_id,
          book_test_id: t.book_test_id,
        })),
        note || undefined
      )
      if (result?.error) {
        setServerError(result.error)
        return
      }
      // Yayınlanan plan taslakta durmamalı.
      await clearWeeklyPlanDraftAction(workspaceId, studentId)
      // R6-03.5: öğretmen yayından sonra AYNI Kitap Haritasında kalır ve yeni
      // durumları yerinde görür. Öğrenci sayfasına dönmek artık bir seçim,
      // zorunluluk değil.
      setBasketIds(new Set())
      clearMapSelection()
      setTitle('')
      setNote('')
      toast.success('Plan yayınlandı. Harita güncellendi.')
      router.refresh()
    })
  }

  function copyShareText() {
    if (selectedTests.length === 0) return
    // Metin üretimi lib/share-text.ts'te; sıkıştırma kuralları (R4 §7)
    // orada tek yerde duruyor ve testleniyor.
    navigator.clipboard.writeText(
      buildShareText({
        studentName,
        dueDate,
        books: groupedSelection.map(group => ({
          bookTitle: group.bookTitle,
          trackingMode: group.trackingMode,
          // R7-02: sepette zaten hesaplanan kitap bazlı adet metne taşınır.
          unitCount: group.count,
          sections: [...group.sections.values()].map(section => ({
            title: section.title,
            units: section.units,
          })),
          videoTasks: group.videoTasks,
        })),
        note: note || undefined,
      })
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function focusDueDate() {
    dueDateRef.current?.focus()
    dueDateRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <div className="space-y-5">
      {/* Başlık + aksiyonlar */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{studentName}</span>
            <span className="text-muted-foreground/50">›</span>
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {activeBook?.title ?? 'Haftalık Plan'}
            </h1>
            {activeBook?.examType && <Badge variant="info">{activeBook.examType}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[activeBook?.subject, activeBook?.publisher].filter(Boolean).join(' · ') ||
              'Haftalık plan hazırlanıyor'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={focusDueDate}>
            <CalendarDays />
            {dueDate ? new Date(dueDate).toLocaleDateString('tr-TR') : 'Teslim tarihi'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={copyShareText}
            disabled={selectedTests.length === 0}
          >
            {copied ? <Check className="text-success" /> : <Copy />}
            {copied ? 'Kopyalandı!' : 'Ödev metnini kopyala'}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isPending || selectedTests.length === 0 || !dueDate}
          >
            {isPending ? <Loader2 className="animate-spin" /> : <Send />}
            Planı Yayınla
          </Button>
        </div>
      </div>

      {/* R7-03: sepet artık 2xl'de değil lg'de sabitlenir. Amaç, öğretmenin
          Kitap Haritasından kopmadan çok kitaplı bir ödev sepeti
          hazırlayabilmesi. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {activeMetrics && (
            <MetricTiles
              metrics={[
                {
                  label: `Toplam ${unitLabel(activeBook?.trackingMode)}`,
                  value: activeMetrics.total,
                  icon: BookOpen,
                },
                {
                  label: COUNTER_LABEL.completed,
                  value: activeMetrics.completed,
                  tone: 'success',
                  icon: CircleCheck,
                },
                {
                  label: COUNTER_LABEL.pending,
                  value: activeMetrics.assigned,
                  tone: 'warning',
                  icon: UserRound,
                },
                {
                  label: COUNTER_LABEL.pendingApproval,
                  value: activeMetrics.pendingApproval,
                  tone: 'info',
                  icon: Hourglass,
                },
                {
                  label: COUNTER_LABEL.overdue,
                  value: activeMetrics.overdue,
                  tone: 'destructive',
                  icon: CircleAlert,
                },
                { label: 'Kalan', value: activeMetrics.remaining, icon: CircleDashed },
              ]}
            />
          )}

          {activeBook && (
            <>
              <TempoStrip
                startDate={activeBook.startDate}
                targetEndDate={activeBook.targetEndDate}
                totalUnits={activeBook.totalTests}
                completedUnits={activeBook.completedTests}
                trackingMode={activeBook.trackingMode}
              />
              <ProgressSummary
                trackingMode={activeBook.trackingMode}
                startDate={activeBook.startDate}
                targetEndDate={activeBook.targetEndDate}
                totalUnits={activeBook.totalTests}
                completedUnits={activeBook.completedTests}
                label={`${activeBook.title} ilerlemesi`}
              />
            </>
          )}

          {books.length > 1 && (
            <div className="flex items-center gap-2">
              <Label htmlFor="activeBook" className="shrink-0 text-xs text-muted-foreground">
                Görüntülenen kitap
              </Label>
              <NativeSelect
                id="activeBook"
                value={activeBook?.bookId ?? ''}
                onChange={e => setActiveBookId(e.target.value)}
                className="max-w-xs"
              >
                {books.map(book => (
                  <option key={book.bookId} value={book.bookId}>
                    {book.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          {/* Harita — masaüstü. Dar ekranda gizlenir (R3 v2 "Mobil karar"). */}
          <div className="hidden space-y-3 lg:block">
            {activeBook && (
              <>
                <p className="text-xs text-muted-foreground">
                  Çalışmaları seçmek durumlarını değiştirmez. Değişiklik yalnız
                  aşağıdaki panelden bir işlem uyguladığınızda gerçekleşir.
                </p>
                <BookMapGrid
                  book={activeBook}
                  mode="manage"
                  selectedTestIds={mapSelection}
                  basketTestIds={basketIds}
                  onToggleTest={toggleTest}
                  onToggleSection={toggleSection}
                  onSelectRange={selectRange}
                />
                <BulkActionPanel
                  book={activeBook}
                  selectedIds={mapSelection}
                  onClearSelection={clearMapSelection}
                  onAssign={addToBasket}
                  onComplete={(ids, studiedOn) =>
                    completeUnitsManuallyAction(studentId, activeBook.bookId, {
                      assignmentId: activeBook.assignmentId,
                      unitIds: ids,
                      studiedOn,
                    }).then(reportBulk('tamamlandı olarak işlendi'))
                  }
                  onApprove={ids =>
                    approveUnitsAction(studentId, activeBook.bookId, {
                      assignmentId: activeBook.assignmentId,
                      unitIds: ids,
                    }).then(reportBulk('onaylandı'))
                  }
                  onRevert={ids =>
                    revertUnitsAction(studentId, activeBook.bookId, {
                      assignmentId: activeBook.assignmentId,
                      unitIds: ids,
                    }).then(reportBulk('geri alındı'))
                  }
                />
              </>
            )}
          </div>

          {/* Dar ekran: 18 sütunluk matris yerine sade liste. */}
          <div className="space-y-2 lg:hidden">
            <p className="text-xs text-muted-foreground">
              Kitap Haritası masaüstü içindir. Bu ekranda testler liste olarak seçilir.
            </p>
            {activeBook?.sections.map(section => (
              <div key={section.id} className="rounded-xl border bg-card p-3">
                <p className="mb-2 text-xs font-medium">{section.title}</p>
                <div className="flex flex-wrap gap-1.5">
                  {section.tests.map(test => {
                    // Dar ekranda yönetim işlemleri gösterilmez; liste
                    // doğrudan sepeti doldurur (R3 v2 "Mobil karar").
                    const selectable = isSelectableState(test.state)
                    const selected = basketIds.has(test.id)
                    return (
                      <button
                        key={test.id}
                        type="button"
                        disabled={!selectable}
                        onClick={() => toggleBasket(test.id)}
                        className={cn(
                          'rounded-md border px-2 py-1 text-xs',
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'bg-card text-muted-foreground',
                          !selectable && 'cursor-not-allowed opacity-50'
                        )}
                      >
                        {test.title}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bu Haftanın Planı — tüm kaynaklar tek sepette. */}
        <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start">
          {/* Panel bir dikey yığındır: başlık ve özet üstte sabit, seçim
              listesi TEK kaydırma alanı, yayınlama bloğu altta sabit. Böylece
              70 çalışmalık bir planda bile "Planı Yayınla" erişilebilir kalır
              ve sayfa aşırı uzamaz (R7-03). */}
          <div className="flex max-h-full flex-col overflow-hidden rounded-xl border bg-card">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
              <div className="flex min-w-0 items-center gap-1.5">
                <h2 className="truncate text-sm font-semibold">Bu Haftanın Planı</h2>
                <Info className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(v => !v)}
                aria-expanded={panelOpen}
                aria-label={panelOpen ? 'Planı daralt' : 'Planı genişlet'}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
              >
                {panelOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
            </div>

            {/* Özet listeyle birlikte kaymaz: "3 kitap · 14 çalışma" bilgisi
                panel açıkken her zaman görünür kalır (R7-03). */}
            <p className="shrink-0 px-4 pt-3 text-xs text-muted-foreground">
              {groupedSelection.length} kitap · {selectedTests.length} {basketUnitLabel} planda
            </p>

            {panelOpen && (
              <>
                {selectedTests.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-muted-foreground">
                    Haritadan çalışma seçip &quot;Ödeve Ekle&quot; deyin. Kitap
                    değiştirdiğinizde ve sayfayı yenilediğinizde plan korunur.
                  </p>
                ) : (
                  <div className="min-h-0 flex-1 divide-y overflow-y-auto">
                    {groupedSelection.map(group => (
                      <div key={group.bookId} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveBookId(group.bookId)}
                            className="min-w-0 flex-1 text-left"
                            title="Bu kitabın haritasını göster"
                          >
                            <span
                              className={cn(
                                'truncate text-xs font-medium',
                                group.bookId === activeBook?.bookId && 'text-primary'
                              )}
                            >
                              {group.bookTitle}
                            </span>
                          </button>
                          <Badge variant="info" className="shrink-0 tabular-nums">
                            {formatUnitCount(group.count, group.trackingMode)}
                          </Badge>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {[...group.sections.values()].map(section => (
                            <li
                              key={section.title}
                              className="flex items-start justify-between gap-2 text-[11px]"
                            >
                              <span className="flex min-w-0 gap-1.5 text-muted-foreground">
                                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/60" />
                                <span className="truncate">{section.title}</span>
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {formatSelectedUnits(section.units, group.trackingMode)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                <div className="shrink-0 space-y-3 overflow-y-auto border-t px-4 py-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="title" className="text-xs">
                      Başlık
                    </Label>
                    <Input
                      id="title"
                      placeholder="Örn: Haftalık Plan - 12. Hafta"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dueDate" className="text-xs">
                      Teslim Tarihi
                    </Label>
                    <Input
                      id="dueDate"
                      ref={dueDateRef}
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      min={todayDateString()}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="note" className="text-xs">
                      Ödev notu <span className="text-muted-foreground">(isteğe bağlı)</span>
                    </Label>
                    <Textarea
                      id="note"
                      rows={3}
                      maxLength={2000}
                      placeholder="Örn: Parçalı fonksiyona kadar çalış, yapamadığın soruları gruba at."
                      value={note}
                      onChange={e => setNote(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Öğrencinin ödev detayında ve WhatsApp metninde görünür.
                    </p>
                  </div>

                  {serverError && <p className="text-sm text-destructive">{serverError}</p>}

                  <Button
                    className="w-full"
                    onClick={handleSubmit}
                    disabled={isPending || selectedTests.length === 0 || !dueDate}
                  >
                    {isPending ? <Loader2 className="animate-spin" /> : <Send />}
                    Planı Yayınla
                  </Button>
                  {!dueDate && selectedTests.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Yayınlamak için teslim tarihi girin.
                    </p>
                  )}
                  {selectedTests.length > 0 && (
                    <Button size="xs" variant="ghost" onClick={clearBasket} className="w-full">
                      <Trash2 />
                      Planı temizle
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
