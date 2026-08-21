import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookOpen, Plus } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { loadBookMap } from '@/lib/book-map'
import { testStateLabel, TEST_STATE_VARIANT } from '@/lib/homework-status'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { MetricRow } from '@/components/shared/metric-row'
import { PageHeader } from '@/components/shared/page-header'
import { ProgressBar } from '@/components/shared/progress-bar'
import { PlanTempoCard } from '@/components/shared/plan-tempo-card'
import { Section } from '@/components/shared/section'

export const dynamic = 'force-dynamic'

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

  // Durumlar Kitap Haritası ile aynı yükleyiciden gelir; bu sayfa ile harita
  // aynı test için aynı aktif durumu göstermek zorunda (R3 v2 "Tutarlılık").
  const [book] = await loadBookMap(supabase, { workspaceId, studentId, bookIds: [bookId] })

  if (!book) notFound()

  const totalTests = progress.total_tests ?? 0
  const completedTests = progress.completed_tests ?? 0
  const pendingApprovalCount = book.sections.reduce(
    (sum, s) => sum + s.tests.filter(t => t.state === 'pending_approval').length,
    0
  )
  const overdueCount = book.sections.reduce(
    (sum, s) => sum + s.tests.filter(t => t.state === 'overdue').length,
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
        className="md:grid-cols-5"
        metrics={[
          { label: 'Toplam test', value: totalTests },
          { label: 'Tamamlanan', value: completedTests },
          { label: 'Onay Bekleyen', value: pendingApprovalCount },
          { label: 'Süresi Geçen', value: overdueCount },
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

      <Section
        title="Plan ve tempo"
        description="Hedef tarihe göre konum ve bugün gereken ortalama tempo."
      >
        <PlanTempoCard
          bookTitle={progress.book_title}
          startDate={progress.start_date}
          targetEndDate={progress.target_end_date}
          totalUnits={totalTests}
          completedUnits={completedTests}
        />
      </Section>

      <Section title="Bölümler" description="Bu öğrencinin bu kitaptaki test durumu.">
        {book.sections.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState
              icon={BookOpen}
              title="Bu kitapta aktif test yok"
              description="Kitaba bölüm ve test ekledikten sonra ilerleme burada görünür."
            />
          </div>
        ) : (
          <div className="space-y-4">
            {book.sections.map(section => (
              <div key={section.id} className="overflow-hidden rounded-lg border bg-card">
                <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
                  <h3 className="truncate text-sm font-medium">{section.title}</h3>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {section.completedCount} / {section.tests.length} test tamamlandı
                  </span>
                </div>
                <ul className="divide-y">
                  {section.tests.map(test => (
                    <li
                      key={test.id}
                      className="flex items-center justify-between gap-4 px-4 py-2.5"
                    >
                      <span className="truncate text-sm">{test.title}</span>
                      <Badge variant={TEST_STATE_VARIANT[test.state]} className="shrink-0">
                        {testStateLabel(test.state, 'teacher')}
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
