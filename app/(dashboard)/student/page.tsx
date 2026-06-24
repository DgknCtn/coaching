import { getStudentContext } from '@/lib/workspace'
import { HomeworkList } from './homework-list'
import { BookOpen, ClipboardList, AlertTriangle, CheckCircle2 } from 'lucide-react'

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
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8 pb-6 border-b">
        <h1 className="text-2xl font-extrabold tracking-tight mb-1">Ödevlerim</h1>
        <p className="text-sm text-muted-foreground">
          {overdue.length > 0 && (
            <span className="text-red-600 font-semibold">{overdue.length} gecikmiş · </span>
          )}
          {upcoming.length} yaklaşan ödev
        </p>
      </div>

      {/* Overdue alert banner */}
      {overdue.length > 0 && (
        <div className="mb-6 flex items-center gap-3 px-5 py-4 rounded-2xl border border-l-[3px] border-l-red-500 bg-red-50/60 border-red-200">
          <AlertTriangle className="size-4 text-red-600 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-700">{overdue.length} gecikmiş ödev</p>
            <p className="text-xs text-red-600/75 mt-0.5">Bunları en kısa sürede tamamlamayı unutma!</p>
          </div>
        </div>
      )}

      {overdue.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="size-4 text-red-500" />
            <h2 className="text-sm font-bold text-red-600">Geciken Ödevler</h2>
          </div>
          <HomeworkList batches={overdue as any} />
        </section>
      )}

      {upcoming.length > 0 ? (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground">Bu Hafta ve Yaklaşan</h2>
          </div>
          <HomeworkList batches={upcoming as any} />
        </section>
      ) : overdue.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center text-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40">
          <CheckCircle2 className="size-10 text-emerald-500 mb-3" />
          <p className="font-bold text-emerald-700">Tüm ödevler tamamlandı!</p>
          <p className="text-sm text-emerald-600/70 mt-1">Harika iş çıkardın.</p>
        </div>
      ) : null}

      {/* Book progress */}
      {(bookProgress?.length ?? 0) > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4 pb-3 border-b">
            <BookOpen className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-bold">Kitap İlerlemem</h2>
          </div>
          <div className="space-y-3">
            {bookProgress!.map(p => (
              <div key={p.student_book_assignment_id} className="rounded-2xl border bg-card p-5 shadow-xs">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold">{p.book_title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.subject}</p>
                  </div>
                  <span className="text-2xl font-black text-foreground">{p.completion_percentage}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, Number(p.completion_percentage))}%`,
                      background: 'linear-gradient(90deg, oklch(0.57 0.26 282), oklch(0.65 0.22 300))',
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground font-medium">
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
