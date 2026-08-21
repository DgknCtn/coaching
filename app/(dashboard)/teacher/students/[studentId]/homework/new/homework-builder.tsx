'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Copy, Check, Trash2 } from 'lucide-react'
import { createHomeworkBatchAction } from './actions'
import { saveWeeklyPlanDraftAction, clearWeeklyPlanDraftAction } from './draft-actions'
import { BookMapGrid, BookMapLegend } from './book-map-grid'
import type { BookMapBook } from '@/lib/book-map'
import { isSelectableState } from '@/lib/book-map'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface SelectedTest {
  student_book_assignment_id: string
  book_test_id: string
  bookId: string
  bookTitle: string
  sectionTitle: string
  testTitle: string
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
        for (const test of section.tests) {
          index.set(test.id, {
            student_book_assignment_id: book.assignmentId,
            book_test_id: test.id,
            bookId: book.bookId,
            bookTitle: book.title,
            sectionTitle: section.title,
            testTitle: test.title,
          })
        }
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

  // Kitap başlığı altında gruplanmış sepet ("Bu Haftanın Planı").
  const groupedSelection = useMemo(() => {
    const groups = new Map<string, SelectedTest[]>()
    for (const t of selectedTests) {
      const list = groups.get(t.bookTitle) ?? []
      list.push(t)
      groups.set(t.bookTitle, list)
    }
    return [...groups.entries()]
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

  const toggleTest = useCallback((_bookId: string, testId: string) => {
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

  function selectedCountForBook(book: BookMapBook) {
    let count = 0
    for (const section of book.sections) {
      for (const test of section.tests) {
        if (selectedIds.has(test.id)) count++
      }
    }
    return count
  }

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
    const lines = [
      `Merhaba ${studentName},`,
      '',
      'Bu haftaki ödevlerin:',
      `Teslim tarihi: ${dueDate ? new Date(dueDate).toLocaleDateString('tr-TR') : '—'}`,
      '',
    ]
    for (const [book, tests] of groupedSelection) {
      lines.push(book + ':')
      for (const t of tests) lines.push(`• ${t.sectionTitle} / ${t.testTitle}`)
      lines.push('')
    }
    lines.push('Tamamladığında panelden işaretlemeyi unutma.')
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const activeBook = books.find(b => b.bookId === activeBookId) ?? books[0]

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Teslim Tarihi *</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <p className="text-xs text-muted-foreground">
                Planın tamamı için bir kez girilir.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">Başlık (isteğe bağlı)</Label>
              <Input
                id="title"
                placeholder="Örn: 14–20 Ekim Haftası"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Harita — masaüstü. Dar ekranda gizlenir (R3 v2 "Mobil karar"). */}
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            {books.map(book => {
              const count = selectedCountForBook(book)
              return (
                <button
                  key={book.bookId}
                  type="button"
                  onClick={() => setActiveBookId(book.bookId)}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                    book.bookId === activeBook?.bookId
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'bg-card text-muted-foreground hover:bg-muted'
                  )}
                >
                  <span className="truncate max-w-48">{book.title}</span>
                  {count > 0 && (
                    <Badge variant="default" className="tabular-nums">
                      {count}
                    </Badge>
                  )}
                </button>
              )
            })}
          </div>

          <div className="hidden space-y-3 lg:block">
            <BookMapLegend />
            {activeBook && (
              <>
                <BookMapGrid
                  book={activeBook}
                  selectedTestIds={selectedIds}
                  onToggleTest={toggleTest}
                  onToggleSection={toggleSection}
                />
                <p className="text-xs text-muted-foreground">
                  {activeBook.completedTests} / {activeBook.totalTests} test tamamlandı ·
                  Bölüm adına tıklayarak o bölümün seçilebilir testlerini toplu seçebilirsiniz.
                </p>
              </>
            )}
          </div>

          {/* Dar ekran: 18 sütunluk matris yerine sade liste. */}
          <div className="space-y-2 lg:hidden">
            <p className="text-xs text-muted-foreground">
              Kitap Haritası masaüstü içindir. Bu ekranda testler liste olarak seçilir.
            </p>
            {activeBook?.sections.map(section => (
              <div key={section.id} className="rounded-lg border bg-card p-3">
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
                          'rounded border px-2 py-1 text-xs',
                          selected
                            ? 'border-primary bg-primary/10'
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
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <Card className={cn(selectedTests.length > 0 && 'border-primary/30')}>
            <CardContent className="space-y-3 pt-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Bu Haftanın Planı</h2>
                <span className="text-sm font-semibold tabular-nums">
                  {selectedTests.length} test
                </span>
              </div>

              {selectedTests.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Haritadan test seçin. Kitap değiştirdiğinizde ve sayfayı yenilediğinizde
                  seçimleriniz korunur.
                </p>
              ) : (
                <>
                  <div className="max-h-72 space-y-2 overflow-y-auto">
                    {groupedSelection.map(([bookTitle, tests]) => (
                      <div key={bookTitle}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium">{bookTitle}</p>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {tests.length} test
                          </span>
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {tests.map(t => (
                            <p
                              key={t.book_test_id}
                              className="truncate text-[11px] text-muted-foreground"
                            >
                              {t.sectionTitle} / {t.testTitle}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Button size="xs" variant="outline" onClick={copyShareText}>
                      {copied ? <Check className="text-success" /> : <Copy />}
                      {copied ? 'Kopyalandı!' : 'Ödev metnini kopyala'}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={clearSelection}>
                      <Trash2 />
                      Temizle
                    </Button>
                  </div>
                </>
              )}

              {serverError && <p className="text-sm text-destructive">{serverError}</p>}

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={isPending || selectedTests.length === 0 || !dueDate}
              >
                {isPending && <Loader2 className="animate-spin" />}
                Planı Yayınla ({selectedTests.length} test)
              </Button>
              {!dueDate && selectedTests.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Yayınlamak için teslim tarihi girin.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
