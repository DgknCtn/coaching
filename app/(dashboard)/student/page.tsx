import { getStudentContext } from '@/lib/workspace'
import { HomeworkList } from './homework-list'

export const dynamic = 'force-dynamic'

export default async function StudentPage() {
  const { supabase, student, workspaceId } = await getStudentContext()

  const { data: batches } = await supabase
    .from('homework_batches')
    .select(`
      id, title, due_date, status,
      homework_items(
        id, status, completed_at,
        books(title, subject),
        book_sections(title),
        book_tests(title)
      )
    `)
    .eq('student_id', student.id)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .order('due_date', { ascending: true })

  const { data: bookProgress } = await supabase
    .from('student_book_progress_view')
    .select('*')
    .eq('student_id', student.id)
    .eq('workspace_id', workspaceId)

  const todayStr = new Date().toISOString().split('T')[0]

  const overdue = (batches ?? []).filter(b => {
    return b.due_date < todayStr && (b.homework_items as { status: string }[]).some(i => i.status === 'pending')
  })
  const upcoming = (batches ?? []).filter(b => b.due_date >= todayStr)

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Ödevlerim</h1>

      {overdue.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-medium text-red-600 mb-2">Geciken Ödevler</h2>
          <HomeworkList batches={overdue as any} />
        </section>
      )}

      {upcoming.length > 0 ? (
        <section className="mb-6">
          <h2 className="text-sm font-medium mb-2">Bu Hafta ve Yaklaşan</h2>
          <HomeworkList batches={upcoming as any} />
        </section>
      ) : overdue.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground rounded-xl border border-dashed">
          <p>Bekleyen ödev yok. 🎉</p>
        </div>
      ) : null}

      {(bookProgress?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-sm font-medium mb-3">Kitap İlerlemem</h2>
          <div className="space-y-3">
            {bookProgress!.map(p => (
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
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min(100, Number(p.completion_percentage))}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {p.completed_tests} / {p.total_tests} test tamamlandı · {p.remaining_tests} kaldı
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
