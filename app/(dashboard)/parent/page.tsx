import { BookOpen, Users } from 'lucide-react'
import { getParentContext } from '@/lib/workspace'
import { Badge } from '@/components/ui/badge'
import { BookCard } from '@/components/shared/book-card'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { MetricRow } from '@/components/shared/metric-row'
import { COUNTER_LABEL, OVERDUE_HINT } from '@/lib/homework-status'
import { AlertBanner } from '@/components/shared/alert-banner'
import { HomeworkBatchRow } from '@/components/shared/homework-batch-row'
import { PlanTempoCard } from '@/components/shared/plan-tempo-card'

export const dynamic = 'force-dynamic'

export default async function ParentPage() {
  const { supabase, workspaceId, linkedStudents } = await getParentContext()

  const todayStr = new Date().toISOString().split('T')[0]

  const studentData = await Promise.all(
    linkedStudents.map(async (link) => {
      const studentId = link.students.id

      const [{ data: bookProgress }, { data: batches }, { data: weeklySummary }] = await Promise.all([
        supabase
          .from('student_book_progress_view')
          .select('*')
          .eq('student_id', studentId)
          .eq('workspace_id', workspaceId),
        supabase
          .from('homework_batches')
          .select('id, title, due_date, status, homework_items(id, status)')
          .eq('student_id', studentId)
          .eq('workspace_id', workspaceId)
          .eq('status', 'active')
          .order('due_date', { ascending: false })
          .limit(10),
        supabase
          .from('student_weekly_homework_summary_view')
          .select('*')
          .eq('student_id', studentId)
          .eq('workspace_id', workspaceId)
          .maybeSingle(),
      ])

      return {
        student: link.students,
        bookProgress: bookProgress ?? [],
        batches: batches ?? [],
        weekly: weeklySummary,
      }
    })
  )

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-8">
      <PageHeader
        title="Veli Paneli"
        subtitle="Öğrencilerinizin gelişimini takip edin"
      />

      {studentData.length === 0 && (
        <Section variant="card">
          <EmptyState
            icon={Users}
            title="Bağlı öğrenci yok"
            description="Öğretmeninizden davet bekleniyor."
          />
        </Section>
      )}

      {studentData.map(({ student, bookProgress, batches, weekly }) => {
        const overdueBatches = batches.filter((b) => {
          return (
            b.due_date < todayStr &&
            (b.homework_items as { status: string }[]).some((i) => i.status === 'pending')
          )
        })

        // Genel (dönem geneli) ilerleme — atanmış tüm kitaplar üzerinden.
        const overallTotal = bookProgress.reduce((s, p) => s + Number(p.total_tests ?? 0), 0)
        const overallCompleted = bookProgress.reduce((s, p) => s + Number(p.completed_tests ?? 0), 0)
        const overallPct = overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : 0
        const hasActivity = bookProgress.length > 0 || batches.length > 0
        const onTrack = hasActivity && overdueBatches.length === 0

        return (
          <div key={student.id} className="space-y-6 border-t pt-8 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{student.full_name}</h2>
              {student.exam_type && <Badge variant="neutral">{student.exam_type}</Badge>}
              {student.grade_level && <Badge variant="neutral">{student.grade_level}</Badge>}
            </div>

            {overdueBatches.length > 0 && (
              <AlertBanner
                tone="warning"
                title={`${overdueBatches.length} gecikmiş ödev grubu`}
                description="Öğretmeninizle iletişime geçin."
              />
            )}

            {onTrack && (
              <AlertBanner
                tone="success"
                title="Her şey yolunda"
                description="Gecikmiş ödev yok, güzel gidiyor."
              />
            )}

            {weekly && (
              <Section title="Bu hafta">
                <MetricRow
                  className="md:grid-cols-5"
                  metrics={[
                    { label: COUNTER_LABEL.assigned, value: weekly.assigned_tests ?? 0 },
                    { label: COUNTER_LABEL.completed, value: weekly.completed_tests ?? 0 },
                    { label: COUNTER_LABEL.pending, value: weekly.pending_tests ?? 0 },
                    {
                      label: COUNTER_LABEL.pendingApproval,
                      value: weekly.pending_approval_tests ?? 0,
                    },
                    {
                      label: COUNTER_LABEL.overdue,
                      value: weekly.overdue_tests ?? 0,
                      hint: OVERDUE_HINT,
                    },
                  ]}
                />
              </Section>
            )}

            {hasActivity && (
              <Section title="Dönem geneli">
                <MetricRow
                  metrics={[
                    { label: 'Genel ilerleme', value: `${overallPct}%` },
                    {
                      label: 'Tamamlanan test',
                      value: overallCompleted,
                      subValue: `/${overallTotal}`,
                    },
                    { label: 'Aktif kitap', value: bookProgress.length },
                  ]}
                  className="md:grid-cols-3"
                />
              </Section>
            )}

            {bookProgress.length > 0 && (
              <Section
                title="Plan ve tempo"
                description="Hedef tarihe göre nerede olunduğu ve bugün gereken ortalama tempo."
              >
                <div className="space-y-3">
                  {bookProgress.map((p) => (
                    <PlanTempoCard
                      key={p.student_book_assignment_id}
                      bookTitle={p.book_title}
                      startDate={p.start_date}
                      targetEndDate={p.target_end_date}
                      totalUnits={Number(p.total_tests ?? 0)}
                      completedUnits={Number(p.completed_tests ?? 0)}
                    />
                  ))}
                </div>
              </Section>
            )}

            {bookProgress.length > 0 && (
              <Section title="Kitap ilerlemesi">
                <div className="grid gap-3 sm:grid-cols-2">
                  {bookProgress.map((p) => (
                    <BookCard
                      key={p.student_book_assignment_id}
                      href={`/parent/students/${student.id}/books/${p.book_id}`}
                      book={{
                        id: p.book_id,
                        title: p.book_title,
                        subject: p.subject,
                      }}
                      progress={{
                        completed: p.completed_tests,
                        total: p.total_tests,
                        percentage: Number(p.completion_percentage),
                        targetDate: p.target_end_date,
                      }}
                    />
                  ))}
                </div>
              </Section>
            )}

            {batches.length > 0 && (
              <Section title="Son ödevler" variant="card">
                <ul className="divide-y">
                  {batches.slice(0, 5).map((batch) => {
                    const items = batch.homework_items as { id: string; status: string }[]
                    const total = items.filter((i) => i.status !== 'cancelled').length
                    const completed = items.filter((i) => i.status === 'completed').length
                    const isOverdue =
                      batch.due_date < todayStr && items.some((i) => i.status === 'pending')

                    return (
                      <li key={batch.id}>
                        <HomeworkBatchRow
                          title={batch.title}
                          dueDate={batch.due_date}
                          completed={completed}
                          total={total}
                          isOverdue={isOverdue}
                          dateStyle={{ day: 'numeric', month: 'long' }}
                        />
                      </li>
                    )
                  })}
                </ul>
              </Section>
            )}

            {bookProgress.length === 0 && batches.length === 0 && !weekly && (
              <Section variant="card">
                <EmptyState
                  icon={BookOpen}
                  title="Henüz veri yok"
                  description="Öğretmen henüz kitap veya ödev atamamış."
                />
              </Section>
            )}
          </div>
        )
      })}
    </div>
  )
}
