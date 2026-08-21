import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookOpen, Plus } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { MetricRow } from '@/components/shared/metric-row'
import { PageHeader } from '@/components/shared/page-header'
import { ProgressBar } from '@/components/shared/progress-bar'
import { Section } from '@/components/shared/section'

export const dynamic = 'force-dynamic'

type TestState = 'completed' | 'pending_approval' | 'assigned' | 'not_assigned'

const STATE_LABEL: Record<TestState, string> = {
  completed: 'Tamamlandı',
  pending_approval: 'Onay bekliyor',
  assigned: 'Ödevde',
  not_assigned: 'Henüz verilmedi',
}

const STATE_VARIANT: Record<TestState, 'success' | 'warning' | 'info' | 'neutral'> = {
  completed: 'success',
  pending_approval: 'warning',
  assigned: 'info',
  not_assigned: 'neutral',
}

export default async function StudentBookDetailPage({
  params,
}: {
  params: Promise<{ studentId: string; bookId: string }>
}) {
  const { studentId, bookId } = await params
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, grade_level, exam_type, status')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student || student.status === 'archived') notFound()

  // Kitap bu öğrenciye atanmış mı? View sadece status='active' atamaları döner,
  // dolayısıyla satır yoksa bu sayfanın gösterecek bir bağlamı da yok.
  const { data: progress } = await supabase
    .from('student_book_progress_view')
    .select('*')
    .eq('student_id', studentId)
    .eq('book_id', bookId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!progress) notFound()

  const assignmentId = progress.student_book_assignment_id

  const { data: book } = await supabase
    .from('books')
    .select(`
      id, title, status,
      book_sections(
        id, title, order_index, status,
        book_tests(id, title, order_index, status)
      )
    `)
    .eq('id', bookId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!book) notFound()

  const { data: completions } = await supabase
    .from('test_completions')
    .select('book_test_id')
    .eq('student_book_assignment_id', assignmentId)
    .eq('status', 'active')

  const { data: openItems } = await supabase
    .from('homework_items')
    .select('book_test_id, status')
    .eq('student_book_assignment_id', assignmentId)
    .in('status', ['pending', 'pending_approval'])

  const completedIds = new Set((completions ?? []).map((c) => c.book_test_id))
  const pendingApprovalIds = new Set(
    (openItems ?? []).filter((i) => i.status === 'pending_approval').map((i) => i.book_test_id)
  )
  const assignedIds = new Set(
    (openItems ?? []).filter((i) => i.status === 'pending').map((i) => i.book_test_id)
  )

  const stateOf = (testId: string): TestState => {
    if (completedIds.has(testId)) return 'completed'
    if (pendingApprovalIds.has(testId)) return 'pending_approval'
    if (assignedIds.has(testId)) return 'assigned'
    return 'not_assigned'
  }

  const sections = (book.book_sections ?? [])
    .filter((s) => s.status === 'active')
    .sort((a, b) => a.order_index - b.order_index)
    .map((s) => {
      const tests = (s.book_tests ?? [])
        .filter((t) => t.status === 'active')
        .sort((a, b) => a.order_index - b.order_index)
        .map((t) => ({ id: t.id, title: t.title, state: stateOf(t.id) }))
      return {
        id: s.id,
        title: s.title,
        tests,
        completed: tests.filter((t) => t.state === 'completed').length,
      }
    })
    .filter((s) => s.tests.length > 0)

  const totalTests = progress.total_tests ?? 0
  const completedTests = progress.completed_tests ?? 0
  const pendingApprovalCount = sections.reduce(
    (sum, s) => sum + s.tests.filter((t) => t.state === 'pending_approval').length,
    0
  )
  const percentage = Number(progress.completion_percentage ?? 0)

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 md:p-8">
      <PageHeader
        backHref={`/teacher/students/${studentId}`}
        title={`${student.full_name} › ${progress.book_title}`}
        subtitle={[progress.subject, progress.publisher].filter(Boolean).join(' · ')}
        badges={
          progress.exam_type ? <Badge variant="neutral">{progress.exam_type}</Badge> : undefined
        }
        action={
          <Button size="sm" render={<Link href={`/teacher/students/${studentId}/homework/new`} />}>
            <Plus />
            Ödev Ver
          </Button>
        }
      />

      <MetricRow
        metrics={[
          { label: 'Toplam test', value: totalTests },
          { label: 'Tamamlanan', value: completedTests },
          { label: 'Onay bekliyor', value: pendingApprovalCount },
          { label: 'Kalan', value: Math.max(0, totalTests - completedTests) },
        ]}
      />

      <div className="space-y-2 rounded-lg border bg-card p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {completedTests} / {totalTests} test tamamlandı
          </span>
          <span className="font-medium tabular-nums">{percentage}%</span>
        </div>
        <ProgressBar value={percentage} label={`${progress.book_title} ilerlemesi`} />
        {progress.target_end_date && (
          <p className="text-xs text-muted-foreground">
            Hedef: {new Date(progress.target_end_date).toLocaleDateString('tr-TR')}
          </p>
        )}
      </div>

      <Section title="Bölümler" description="Bu öğrencinin bu kitaptaki test durumu.">
        {sections.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState
              icon={BookOpen}
              title="Bu kitapta aktif test yok"
              description="Kitaba bölüm ve test ekledikten sonra ilerleme burada görünür."
            />
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map((section) => (
              <div key={section.id} className="overflow-hidden rounded-lg border bg-card">
                <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
                  <h3 className="truncate text-sm font-medium">{section.title}</h3>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {section.completed} / {section.tests.length} test tamamlandı
                  </span>
                </div>
                <ul className="divide-y">
                  {section.tests.map((test) => (
                    <li
                      key={test.id}
                      className="flex items-center justify-between gap-4 px-4 py-2.5"
                    >
                      <span className="truncate text-sm">{test.title}</span>
                      <Badge variant={STATE_VARIANT[test.state]} className="shrink-0">
                        {STATE_LABEL[test.state]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
