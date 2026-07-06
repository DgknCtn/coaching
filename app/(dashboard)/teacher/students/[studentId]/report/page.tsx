import { notFound } from 'next/navigation'
import { BookOpen, ClipboardList, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/shared/stat-card'
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
    if (new Date(b.due_date) < now) {
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
    <div className="p-6 md:p-8 max-w-4xl mx-auto print:p-0">
      <PageHeader
        backHref={`/teacher/students/${studentId}`}
        title={`${student.full_name} — İlerleme Raporu`}
        subtitle={`Oluşturulma: ${generatedAt}`}
        badges={
          <>
            {student.exam_type && <Badge variant="secondary" className="rounded-lg">{student.exam_type}</Badge>}
            {student.grade_level && <Badge variant="outline" className="rounded-lg">{student.grade_level}</Badge>}
          </>
        }
        action={<PrintButton />}
      />

      {/* Genel özet */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={TrendingUp}
          label="Genel İlerleme"
          value={`${overallPct}%`}
          colorScheme={overallPct >= 70 ? 'emerald' : overallPct >= 40 ? 'indigo' : 'red'}
        />
        <StatCard
          icon={BookOpen}
          label="Test (tamamlanan)"
          value={completedTests}
          subValue={`/${totalTests}`}
          colorScheme="neutral"
        />
        <StatCard
          icon={CheckCircle2}
          label="Ödev Tamamlama"
          value={`${hwRate}%`}
          subValue={`${hwCompleted}/${hwTotal}`}
          colorScheme={hwRate >= 70 ? 'emerald' : 'neutral'}
        />
        <StatCard
          icon={AlertTriangle}
          label="Geciken Test"
          value={hwOverdue}
          colorScheme={hwOverdue > 0 ? 'red' : 'neutral'}
        />
      </div>

      {/* Kitap bazlı ilerleme */}
      <h2 className="font-bold text-sm text-foreground mb-4">Kitap Bazlı İlerleme</h2>
      {!books.length ? (
        <div className="bg-card rounded-2xl border shadow-xs">
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
                className="bg-card rounded-2xl border px-5 py-4 shadow-xs print:shadow-none print:break-inside-avoid"
              >
                <div className="flex items-center justify-between gap-4 mb-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{b.book_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[b.subject, b.exam_type].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black">
                      {b.completed_tests}
                      <span className="text-muted-foreground text-sm font-normal">/{b.total_tests}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground font-medium">test</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background:
                          pct >= 70
                            ? 'oklch(0.50 0.18 155)'
                            : 'linear-gradient(90deg, oklch(0.57 0.26 282), oklch(0.65 0.22 300))',
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold text-muted-foreground w-10 text-right">{pct}%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
