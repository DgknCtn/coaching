import { notFound } from 'next/navigation'
import { isOverdue } from '@/lib/homework-status'
import { BookOpen } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Badge } from '@/components/ui/badge'
import { MetricRow } from '@/components/shared/metric-row'
import { Section } from '@/components/shared/section'
import { ProgressBar } from '@/components/shared/progress-bar'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { PrintButton } from './print-button'

export const dynamic = 'force-dynamic'

interface HomeworkItem {
  status: string
}
interface HomeworkBatch {
  due_date: string
  status: string
  homework_items: HomeworkItem[]
}

export default async function StudentReportPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, exam_type, grade_level, status')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student || student.status === 'archived') notFound()

  const { data: bookProgress } = await supabase
    .from('student_book_progress_view')
    .select('*')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)

  // Tüm zamanlar ödev geçmişi (aktif partiler) — tamamlanma ve gecikme oranı.
  const { data: batches } = await supabase
    .from('homework_batches')
    .select('due_date, status, homework_items(status)')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .limit(500)

  const books = bookProgress ?? []
  const totalTests = books.reduce((s, b) => s + Number(b.total_tests ?? 0), 0)
  const completedTests = books.reduce((s, b) => s + Number(b.completed_tests ?? 0), 0)
  const overallPct = totalTests > 0 ? Math.round((completedTests / totalTests) * 100) : 0

  // Ödev metrikleri
  const now = new Date()
  let hwTotal = 0
  let hwCompleted = 0
  let hwOverdue = 0
  for (const b of (batches ?? []) as HomeworkBatch[]) {
    const items = b.homework_items ?? []
    const active = items.filter((i) => i.status !== 'cancelled')
    hwTotal += active.length
    hwCompleted += active.filter((i) => i.status === 'completed').length
    // R6-02: date-only karşılaştırma; teslim günü boyunca gecikme yoktur.
    if (isOverdue(b.due_date, now)) {
      hwOverdue += active.filter((i) => i.status === 'pending').length
    }
  }
  const hwRate = hwTotal > 0 ? Math.round((hwCompleted / hwTotal) * 100) : 0

  const generatedAt = now.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 md:p-8 print:p-0">
      <PageHeader
        backHref={`/teacher/students/${studentId}`}
        title={`${student.full_name} — İlerleme Raporu`}
        subtitle={`Oluşturulma: ${generatedAt}`}
        badges={
          <>
            {student.exam_type && <Badge variant="neutral">{student.exam_type}</Badge>}
            {student.grade_level && <Badge variant="neutral">{student.grade_level}</Badge>}
          </>
        }
        action={<PrintButton />}
      />

      <MetricRow
        metrics={[
          { label: 'Genel ilerleme', value: `${overallPct}%` },
          { label: 'Tamamlanan çalışma', value: completedTests, subValue: `/${totalTests}` },
          { label: 'Ödev tamamlama', value: `${hwRate}%`, hint: `${hwCompleted}/${hwTotal}` },
          { label: 'Geciken çalışma', value: hwOverdue },
        ]}
      />

      <Section title="Kitap bazlı ilerleme">
      {!books.length ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={BookOpen}
            title="Atanmış kitap yok"
            description="Bu öğrenciye kitap atandığında ilerleme burada görünür."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {books.map((b) => {
            const pct = Number(b.completion_percentage ?? 0)
            return (
              <div
                key={b.student_book_assignment_id}
                className="rounded-lg border bg-card p-4 print:break-inside-avoid"
              >
                <div className="mb-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.book_title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[b.subject, b.exam_type].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums">
                      {b.completed_tests}
                      <span className="text-muted-foreground">/{b.total_tests}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">test</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ProgressBar value={pct} label={`${b.book_title} ilerlemesi`} className="flex-1" />
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {pct}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
      </Section>
    </div>
  )
}
