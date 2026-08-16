import { notFound } from 'next/navigation'
import { BookOpen, Calendar, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { calculatePlanPace } from '@/lib/plan-pace'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { ProgressBar } from '@/components/shared/progress-bar'

export const dynamic = 'force-dynamic'

// plan-pace çıktısı → badge variant. Mantık lib/plan-pace.ts'te kalır.
const paceVariant: Record<string, 'success' | 'info' | 'warning' | 'neutral'> = {
  ahead: 'success',
  on_track: 'info',
  behind: 'warning',
  no_target: 'neutral',
  not_started: 'neutral',
}

export default async function StudentGoalsPage({
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

  const books = bookProgress ?? []
  const today = new Date()

  const paced = books.map((b) => ({
    book: b,
    pace: calculatePlanPace({
      startDate: b.start_date,
      targetEndDate: b.target_end_date,
      totalUnits: Number(b.total_tests ?? 0),
      completedUnits: Number(b.completed_tests ?? 0),
      today,
    }),
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 md:p-8">
      <PageHeader
        backHref={`/teacher/students/${studentId}`}
        title={`${student.full_name} — Hedef`}
        subtitle="Her kitap için plan çizgisine göre ilerleme"
        badges={
          <>
            {student.exam_type && <Badge variant="neutral">{student.exam_type}</Badge>}
            {student.grade_level && <Badge variant="neutral">{student.grade_level}</Badge>}
          </>
        }
      />

      {!books.length ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={BookOpen}
            title="Atanmış kitap yok"
            description="Bu öğrenciye kitap atandığında hedef ilerlemesi burada görünür."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {paced.map(({ book: b, pace }) => {
            const pct = Number(b.completion_percentage ?? 0)
            const remainingUnits = Math.max(Number(b.total_tests ?? 0) - Number(b.completed_tests ?? 0), 0)
            const remainingDays = b.target_end_date
              ? Math.ceil((new Date(b.target_end_date).getTime() - today.getTime()) / 86_400_000)
              : null

            return (
              <div
                key={b.student_book_assignment_id}
                className="rounded-lg border bg-card p-4"
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      {b.tracking_mode === 'page' ? 'sayfa aralığı' : 'test'}
                    </p>
                  </div>
                </div>

                <div className="mb-3 flex items-center gap-3">
                  <ProgressBar value={pct} label={`${b.book_title} ilerlemesi`} className="flex-1" />
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {pct}%
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Badge variant={paceVariant[pace.phraseKey] ?? 'neutral'}>
                    {pace.phraseKey === 'ahead' && <TrendingUp />}
                    {pace.phraseKey === 'behind' && <TrendingDown />}
                    {pace.phraseKey === 'on_track' && <Minus />}
                    {pace.phrase}
                  </Badge>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {remainingUnits} {b.tracking_mode === 'page' ? 'sayfa aralığı' : 'test'} kaldı
                    </span>
                    {remainingDays !== null && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3.5" />
                        {remainingDays >= 0 ? `${remainingDays} gün kaldı` : 'Hedef tarihi geçti'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
