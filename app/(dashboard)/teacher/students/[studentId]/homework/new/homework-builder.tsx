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
import { createHomeworkBatchAction } from './actions'
import { saveWeeklyPlanDraftAction, clearWeeklyPlanDraftAction } from './draft-actions'
import { BookMapGrid } from '@/components/shared/book-map-grid'
import type { BookMapBook } from '@/lib/book-map'
import { isSelectableState, formatSelectedUnits } from '@/lib/book-map'
import { buildShareText } from '@/lib/share-text'
import { COUNTER_LABEL } from '@/lib/homework-status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { NativeSelect } from '@/components/ui/native-select'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { TempoStrip } from '@/components/shared/tempo-strip'
import { ProgressSummary } from '@/components/shared/progress-summary'
import { cn } from '@/lib/utils'

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
  /** 019 taslağından hidrate edilen seçimler (sayfa yenilemede korunur). */
  initialSelectedTestIds: string[]
  initialDueDate: string
  initialTitle: string
}

export function HomeworkBuilder({
  studentId,
  termId,
  workspaceId,
  studentName,
  books,
  initialSelectedTestIds,
  initialDueDate,
  initialTitle,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeBookId, setActiveBookId] = useState(books[0]?.bookId ?? '')
  const [dueDate, setDueDate] = useState(initialDueDate)
  const [title, setTitle] = useState(initialTitle)
  const [serverError, setServerError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const dueDateRef = useRef<HTMLInputElement>(null)

  // Seçimler kitap bileşeninin İÇİNDE değil, bu üst katmanda tutulur —
  // eğitmen kitaplar arasında dolaşırken seçim kaybolmaz (R3 v2 §B).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelectedTestIds)
  )

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
            sectionTitle: section.title,
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

  const selectedTests = useMemo(
    () =>
      [...selectedIds]
        .map(id => testIndex.get(id))
        .filter((t): t is SelectedTest => Boolean(t)),
    [selectedIds, testIndex]
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
        }))
      )
    }, 500)
    return () => clearTimeout(handle)
  }, [selectedTests, dueDate, title, workspaceId, studentId])

  // Shift+tık aralık seçiminin çıpası: en son tıklanan hücre.
  const lastClickedRef = useRef<string | null>(null)

  const toggleTest = useCallback((_bookId: string, testId: string) => {
    lastClickedRef.current = testId
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(testId)) next.delete(testId)
      else next.add(testId)
      return next
    })
  }, [])

  const toggleSection = useCallback((_bookId: string, testIds: string[]) => {
    if (testIds.length === 0) return
    setSelectedIds(prev => {
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
      const ids = flat
        .slice(start, end + 1)
        .filter(t => isSelectableState(t.state))
        .map(t => t.id)

      lastClickedRef.current = testId
      setSelectedIds(prev => {
        const next = new Set(prev)
        for (const id of ids) next.add(id)
        return next
      })
    },
    [books, toggleTest]
  )

  function clearSelection() {
    setSelectedIds(new Set())
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
        }))
      )
      if (result?.error) {
        setServerError(result.error)
        return
      }
      // Yayınlanan plan taslakta durmamalı.
      await clearWeeklyPlanDraftAction(workspaceId, studentId)
      router.push(`/teacher/students/${studentId}`)
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
          sections: [...group.sections.values()].map(section => ({
            title: section.title,
            units: section.units,
          })),
          videoTasks: group.videoTasks,
        })),
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

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {activeMetrics && (
            <MetricTiles
              metrics={[
                { label: 'Toplam test', value: activeMetrics.total, icon: BookOpen },
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
              />
              <ProgressSummary
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
          <div className="hidden lg:block">
            {activeBook && (
              <BookMapGrid
                book={activeBook}
                selectedTestIds={selectedIds}
                onToggleTest={toggleTest}
                onToggleSection={toggleSection}
                onSelectRange={selectRange}
              />
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
                    const selectable = isSelectableState(test.state)
                    const selected = selectedIds.has(test.id)
                    return (
                      <button
                        key={test.id}
                        type="button"
                        disabled={!selectable}
                        onClick={() => toggleTest(activeBook.bookId, test.id)}
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
        <aside className="2xl:sticky 2xl:top-6 2xl:self-start">
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
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

            <p className="px-4 pt-3 text-xs text-muted-foreground">
              {groupedSelection.length} kitap · {selectedTests.length} test seçildi
            </p>

            {panelOpen && (
              <>
                {selectedTests.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-muted-foreground">
                    Haritadan test seçin. Kitap değiştirdiğinizde ve sayfayı yenilediğinizde
                    seçimleriniz korunur.
                  </p>
                ) : (
                  <div className="max-h-[26rem] divide-y overflow-y-auto">
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
                            {group.count} test
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

                <div className="space-y-3 border-t px-4 py-3">
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
                      min={new Date().toISOString().split('T')[0]}
                    />
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
                    <Button size="xs" variant="ghost" onClick={clearSelection} className="w-full">
                      <Trash2 />
                      Seçimi temizle
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
