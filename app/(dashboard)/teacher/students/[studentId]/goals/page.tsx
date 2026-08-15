import { notFound } from 'next/navigation'
import { BookOpen, Calendar, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { calculatePlanPace } from '@/lib/plan-pace'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

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
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <PageHeader
        backHref={`/teacher/students/${studentId}`}
        title={`${student.full_name} — Hedef`}
        subtitle="Her kitap için plan çizgisine göre ilerleme"
        badges={
          <>
            {student.exam_type && <Badge variant="secondary" className="rounded-lg">{student.exam_type}</Badge>}
            {student.grade_level && <Badge variant="outline" className="rounded-lg">{student.grade_level}</Badge>}
          </>
        }
      />

      {!books.length ? (
        <div className="bg-card rounded-2xl border shadow-xs">
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
                className="bg-card rounded-2xl border px-5 py-4 shadow-xs"
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
                    <p className="text-[11px] text-muted-foreground font-medium">
                      {b.tracking_mode === 'page' ? 'sayfa aralığı' : 'test'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-3">
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

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold',
                      pace.phraseKey === 'ahead' && 'bg-emerald-50 text-emerald-700',
                      pace.phraseKey === 'on_track' && 'bg-indigo-50 text-indigo-700',
                      pace.phraseKey === 'behind' && 'bg-amber-50 text-amber-700',
                      (pace.phraseKey === 'no_target' || pace.phraseKey === 'not_started') && 'bg-muted text-muted-foreground',
                    )}
                  >
                    {pace.phraseKey === 'ahead' && <TrendingUp className="size-3.5" />}
                    {pace.phraseKey === 'behind' && <TrendingDown className="size-3.5" />}
                    {pace.phraseKey === 'on_track' && <Minus className="size-3.5" />}
                    {pace.phrase}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{remainingUnits} {b.tracking_mode === 'page' ? 'sayfa aralığı' : 'test'} kaldı</span>
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
