import { AlertTriangle, CheckCircle2, Clock, Minus } from 'lucide-react'
import { getParentContext } from '@/lib/workspace'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

export default async function ParentPage() {
  const { supabase, workspaceId, linkedStudents } = await getParentContext()

  const todayStr = new Date().toISOString().split('T')[0]

  // Load data for each linked student
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
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Veli Paneli</h1>

      {studentData.map(({ student, bookProgress, batches, weekly }) => {
        const overdueBatches = batches.filter(b => {
          return b.due_date < todayStr && (b.homework_items as { status: string }[]).some(i => i.status === 'pending')
        })

        return (
          <div key={student.id} className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold">{student.full_name}</h2>
              {student.exam_type && <Badge variant="secondary">{student.exam_type}</Badge>}
              {student.grade_level && <Badge variant="outline">{student.grade_level}</Badge>}
            </div>

            {/* Weekly summary */}
            {weekly && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Verilen', value: weekly.assigned_tests },
                  { label: 'Tamamlanan', value: weekly.completed_tests },
                  { label: 'Bekleyen', value: weekly.pending_tests },
                  { label: 'Geciken', value: weekly.overdue_tests, alert: Number(weekly.overdue_tests) > 0 },
                ].map(({ label, value, alert }) => (
                  <Card key={label} className={alert ? 'border-red-200 bg-red-50' : ''}>
                    <CardContent className="pt-3 pb-3 text-center">
                      <p className={`text-2xl font-bold ${alert ? 'text-red-600' : ''}`}>{value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Overdue alert */}
            {overdueBatches.length > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 mb-4">
                <AlertTriangle className="size-4 shrink-0" />
                <p className="text-sm">{overdueBatches.length} gecikmiş ödev grubu var.</p>
              </div>
            )}

            {/* Book progress */}
            {bookProgress.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium mb-2">Kitap İlerlemesi</h3>
                <div className="space-y-3">
                  {bookProgress.map(p => (
                    <div key={p.student_book_assignment_id} className="rounded-xl border bg-card p-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <p className="text-sm font-medium">{p.book_title}</p>
                          <p className="text-xs text-muted-foreground">{p.subject}</p>
                        </div>
                        <p className="text-sm font-bold">{p.completion_percentage}%</p>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${Math.min(100, Number(p.completion_percentage))}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                        <span>{p.completed_tests} / {p.total_tests} test</span>
                        {p.target_end_date && (
                          <span>Hedef: {new Date(p.target_end_date).toLocaleDateString('tr-TR')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent homework */}
            {batches.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Son Ödevler</h3>
                <div className="space-y-2">
                  {batches.slice(0, 5).map(batch => {
                    const items = batch.homework_items as { id: string; status: string }[]
                    const total = items.filter(i => i.status !== 'cancelled').length
                    const completed = items.filter(i => i.status === 'completed').length
                    const isOverdue = batch.due_date < todayStr && items.some(i => i.status === 'pending')
                    return (
                      <div
                        key={batch.id}
                        className={`rounded-xl border bg-card px-4 py-3 flex items-center justify-between ${isOverdue ? 'border-red-200' : ''}`}
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {batch.title ?? new Date(batch.due_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Teslim: {new Date(batch.due_date).toLocaleDateString('tr-TR')}
                            {isOverdue && <span className="text-red-600 ml-1">· Gecikmiş</span>}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{completed}/{total}</p>
                          <p className="text-xs text-muted-foreground">tamamlandı</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
