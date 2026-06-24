import { AlertTriangle, BookOpen, ClipboardList, Users, CheckCircle2, TrendingUp } from 'lucide-react'
import { getParentContext } from '@/lib/workspace'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/shared/stat-card'
import { BookCard } from '@/components/shared/book-card'
import { EmptyState } from '@/components/shared/empty-state'
import { cn } from '@/lib/utils'

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
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8 pb-6 border-b">
        <h1 className="text-2xl font-extrabold tracking-tight">Veli Paneli</h1>
        <p className="text-sm text-muted-foreground mt-1">Öğrencilerinizin gelişimini takip edin</p>
      </div>

      {studentData.length === 0 && (
        <div className="bg-card rounded-2xl border shadow-xs">
          <EmptyState
            icon={Users}
            title="Bağlı öğrenci yok"
            description="Öğretmeninizden davet bekleniyor."
          />
        </div>
      )}

      {studentData.map(({ student, bookProgress, batches, weekly }) => {
        const overdueBatches = batches.filter(b => {
          return b.due_date < todayStr && (b.homework_items as { status: string }[]).some(i => i.status === 'pending')
        })

        return (
          <div key={student.id} className="mb-12">
            {/* Student header card */}
            <div
              className="rounded-2xl p-5 mb-6 relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, oklch(0.52 0.25 282), oklch(0.44 0.22 265))' }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
              <div className="relative flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 backdrop-blur-sm">
                  <span className="text-xl font-black text-white">
                    {student.full_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-xl font-black text-white">{student.full_name}</h2>
                    {student.exam_type && (
                      <span className="px-2 py-0.5 rounded-full bg-white/20 text-[11px] font-bold text-white">
                        {student.exam_type}
                      </span>
                    )}
                    {student.grade_level && (
                      <span className="px-2 py-0.5 rounded-full bg-white/15 border border-white/20 text-[11px] font-semibold text-white/80">
                        {student.grade_level}
                      </span>
                    )}
                  </div>
                  <p className="text-white/60 text-sm font-medium">Bu haftanın özeti</p>
                </div>
              </div>
            </div>

            {/* Weekly summary */}
            {weekly && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <StatCard
                  icon={ClipboardList}
                  label="Verilen"
                  value={weekly.assigned_tests ?? 0}
                  colorScheme="indigo"
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Tamamlanan"
                  value={weekly.completed_tests ?? 0}
                  colorScheme="emerald"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Bekleyen"
                  value={weekly.pending_tests ?? 0}
                  colorScheme="neutral"
                />
                <StatCard
                  icon={AlertTriangle}
                  label="Geciken"
                  value={weekly.overdue_tests ?? 0}
                  colorScheme={Number(weekly.overdue_tests) > 0 ? 'red' : 'neutral'}
                />
              </div>
            )}

            {/* Overdue alert */}
            {overdueBatches.length > 0 && (
              <div className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-l-[3px] border-l-red-500 bg-red-50/60 border-red-200 mb-6">
                <AlertTriangle className="size-4 text-red-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-700">
                    {overdueBatches.length} gecikmiş ödev grubu
                  </p>
                  <p className="text-xs text-red-600/70 mt-0.5">
                    Öğretmeninizle iletişime geçin.
                  </p>
                </div>
              </div>
            )}

            {/* Book progress */}
            {bookProgress.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-bold">Kitap İlerlemesi</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {bookProgress.map(p => (
                    <BookCard
                      key={p.student_book_assignment_id}
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
              </div>
            )}

            {/* Recent homework */}
            {batches.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <ClipboardList className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-bold">Son Ödevler</h3>
                </div>
                <div className="space-y-2.5">
                  {batches.slice(0, 5).map(batch => {
                    const items = batch.homework_items as { id: string; status: string }[]
                    const total = items.filter(i => i.status !== 'cancelled').length
                    const completed = items.filter(i => i.status === 'completed').length
                    const isOverdue = batch.due_date < todayStr && items.some(i => i.status === 'pending')
                    const isComplete = total > 0 && completed === total
                    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
                    return (
                      <div
                        key={batch.id}
                        className={cn(
                          'bg-card rounded-2xl border px-5 py-4 flex items-center justify-between gap-4 shadow-xs',
                          isOverdue && 'border-l-[3px] border-l-red-400',
                          isComplete && 'border-l-[3px] border-l-emerald-400',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-bold truncate">
                              {batch.title ?? new Date(batch.due_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                            </p>
                            {isOverdue && (
                              <span className="text-[11px] text-red-600 font-bold shrink-0">· Gecikmiş</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Teslim: {new Date(batch.due_date).toLocaleDateString('tr-TR')}
                          </p>
                          {total > 0 && (
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[80px]">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${pct}%`,
                                    background: isOverdue
                                      ? 'oklch(0.54 0.22 20)'
                                      : isComplete
                                      ? 'oklch(0.50 0.18 155)'
                                      : 'linear-gradient(90deg, oklch(0.57 0.26 282), oklch(0.65 0.22 300))',
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground font-semibold">{pct}%</span>
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-black">
                            {completed}
                            <span className="text-muted-foreground text-sm font-normal">/{total}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground font-medium">tamamlandı</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {bookProgress.length === 0 && batches.length === 0 && !weekly && (
              <div className="bg-card rounded-2xl border shadow-xs">
                <EmptyState
                  icon={BookOpen}
                  title="Henüz veri yok"
                  description="Öğretmen henüz kitap veya ödev atamamış."
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
