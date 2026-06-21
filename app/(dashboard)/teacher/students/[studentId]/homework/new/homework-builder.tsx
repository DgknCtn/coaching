'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Loader2, Copy, Check } from 'lucide-react'
import { createHomeworkBatchAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface BookTest {
  id: string
  title: string
  order_index: number
  status: string
}
interface BookSection {
  id: string
  title: string
  order_index: number
  book_tests: BookTest[]
}
interface Book {
  id: string
  title: string
  subject: string
  exam_type: string | null
  book_sections: BookSection[]
}
interface Assignment {
  id: string
  book_id: string
  books: Book
}

interface SelectedTest {
  student_book_assignment_id: string
  book_test_id: string
  bookTitle: string
  sectionTitle: string
  testTitle: string
}

interface Props {
  studentId: string
  termId: string
  workspaceId: string
  studentName: string
  assignments: Assignment[]
  pendingTestIds: string[]
  completedTestIds: string[]
}

export function HomeworkBuilder({
  studentId,
  termId,
  workspaceId,
  studentName,
  assignments,
  pendingTestIds,
  completedTestIds,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedTests, setSelectedTests] = useState<SelectedTest[]>([])
  const [dueDate, setDueDate] = useState('')
  const [title, setTitle] = useState('')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [serverError, setServerError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const pendingSet = new Set(pendingTestIds)
  const completedSet = new Set(completedTestIds)
  const selectedSet = new Set(selectedTests.map(t => t.book_test_id))

  function toggleSection(sectionId: string) {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  function toggleTest(assignment: Assignment, section: BookSection, test: BookTest) {
    if (test.status !== 'active') return
    const key = test.id
    if (selectedSet.has(key)) {
      setSelectedTests(prev => prev.filter(t => t.book_test_id !== key))
    } else {
      setSelectedTests(prev => [...prev, {
        student_book_assignment_id: assignment.id,
        book_test_id: test.id,
        bookTitle: assignment.books.title,
        sectionTitle: section.title,
        testTitle: test.title,
      }])
    }
  }

  function handleSubmit() {
    if (!dueDate) return
    if (selectedTests.length === 0) return
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
      } else {
        router.push(`/teacher/students/${studentId}`)
      }
    })
  }

  function copyShareText() {
    if (selectedTests.length === 0) return
    const grouped: Record<string, string[]> = {}
    for (const t of selectedTests) {
      const key = t.bookTitle
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(`• ${t.sectionTitle} / ${t.testTitle}`)
    }
    const lines = [`Merhaba ${studentName},`, '', `Bu haftaki ödevlerin:`, `Teslim tarihi: ${dueDate ? new Date(dueDate).toLocaleDateString('tr-TR') : '—'}`, '']
    for (const [book, tests] of Object.entries(grouped)) {
      lines.push(book + ':')
      lines.push(...tests)
      lines.push('')
    }
    lines.push('Tamamladığında panelden işaretlemeyi unutma.')
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Date + Title */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Teslim Tarihi *</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
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

      {/* Test selection */}
      <div className="space-y-3">
        {assignments.map(assignment => {
          const book = assignment.books
          const sections = [...(book.book_sections ?? [])].sort((a, b) => a.order_index - b.order_index)
          return (
            <Card key={assignment.id}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-medium text-sm">{book.title}</h3>
                  {book.exam_type && <Badge variant="secondary" className="text-xs">{book.exam_type}</Badge>}
                  <span className="text-xs text-muted-foreground">{book.subject}</span>
                </div>
                <div className="space-y-1">
                  {sections.map(section => {
                    const activeTests = section.book_tests.filter(t => t.status === 'active').sort((a, b) => a.order_index - b.order_index)
                    const expanded = expandedSections.has(section.id)
                    return (
                      <div key={section.id}>
                        <button
                          type="button"
                          onClick={() => toggleSection(section.id)}
                          className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded hover:bg-muted transition-colors text-sm"
                        >
                          {expanded ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                          <span>{section.title}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{activeTests.length} test</span>
                        </button>
                        {expanded && (
                          <div className="ml-5 mt-1 space-y-0.5">
                            {activeTests.map(test => {
                              const isSelected = selectedSet.has(test.id)
                              const isPendingTest = pendingSet.has(test.id)
                              const isCompleted = completedSet.has(test.id)
                              return (
                                <label
                                  key={test.id}
                                  className="flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-muted transition-colors text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleTest(assignment, section, test)}
                                    className="size-3.5 rounded"
                                  />
                                  <span className={isCompleted ? 'line-through text-muted-foreground' : ''}>
                                    {test.title}
                                  </span>
                                  {isPendingTest && !isCompleted && (
                                    <AlertTriangle className="size-3 text-yellow-500 shrink-0" aria-label="Zaten bekleyen ödevde var" />
                                  )}
                                  {isCompleted && (
                                    <CheckCircle2 className="size-3 text-green-500 shrink-0" aria-label="Tamamlanmış" />
                                  )}
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Selected summary */}
      {selectedTests.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">{selectedTests.length} test seçildi</p>
              <Button size="xs" variant="outline" onClick={copyShareText}>
                {copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
                {copied ? 'Kopyalandı!' : 'Ödev metnini kopyala'}
              </Button>
            </div>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {selectedTests.map(t => (
                <p key={t.book_test_id} className="text-xs text-muted-foreground">
                  {t.bookTitle} / {t.sectionTitle} / {t.testTitle}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <div className="flex gap-3">
        <Button
          onClick={handleSubmit}
          disabled={isPending || selectedTests.length === 0 || !dueDate}
        >
          {isPending && <Loader2 className="size-4 animate-spin" />}
          Ödevi Kaydet ({selectedTests.length} test)
        </Button>
        <Button variant="ghost" onClick={() => router.push(`/teacher/students/${studentId}`)}>
          İptal
        </Button>
      </div>
    </div>
  )
}
