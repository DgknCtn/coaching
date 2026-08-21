import { getStudentContext } from '@/lib/workspace'
import { HomeworkList } from './homework-list'
import { CheckInCard } from './check-in-card'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { AlertBanner } from '@/components/shared/alert-banner'
import { ProgressBar } from '@/components/shared/progress-bar'

export const dynamic = 'force-dynamic'

export default async function StudentPage() {
  const { supabase, student, workspaceId } = await getStudentContext()

  const { data: batches } = await supabase
    .from('homework_batches')
    .select(`
      id, title, due_date, status,
      homework_items(
        id, status, completed_at, teacher_note, rejected_at, submitted_at,
        books(title, subject),
        book_sections(title),
        book_tests(title)
      )
    `)
    .eq('student_id', student.id)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .order('due_date', { ascending: true })

  // Açık durum bildirimi (varsa) — süresi gelen tek kayıt.
  await supabase.rpc('ensure_student_check_ins', { p_workspace_id: workspaceId })
  const { data: openCheckIn } = await supabase
    .from('student_check_ins')
    .select('id, due_at')
    .eq('student_id', student.id)
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(1)
    .maybeSingle()

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
    <div className="mx-auto max-w-2xl space-y-8 p-6 md:p-8">
      <PageHeader
        title="Ödevlerim"
        subtitle={
          overdue.length > 0
            ? `${overdue.length} gecikmiş · ${upcoming.length} yaklaşan ödev`
            : `${upcoming.length} yaklaşan ödev`
        }
      />

      {openCheckIn && <CheckInCard checkInId={openCheckIn.id} />}

      {overdue.length > 0 && (
        <>
          <AlertBanner
            tone="warning"
            title={`${overdue.length} gecikmiş ödev`}
            description="Bunları en kısa sürede tamamlamayı unutma."
          />
          <Section title="Geciken ödevler">
            <HomeworkList batches={overdue as any} />
          </Section>
        </>
      )}

      {upcoming.length > 0 ? (
        <Section title="Bu hafta ve yaklaşan">
          <HomeworkList batches={upcoming as any} />
        </Section>
      ) : overdue.length === 0 ? (
        <AlertBanner
          tone="success"
          title="Tüm ödevler tamamlandı"
          description="Harika iş çıkardın."
        />
      ) : null}

      {(bookProgress?.length ?? 0) > 0 && (
        <Section title="Kitap ilerlemem">
          <div className="space-y-3">
            {bookProgress!.map(p => (
              <div key={p.student_book_assignment_id} className="rounded-lg border bg-card p-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{p.book_title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{p.subject}</p>
                  </div>
                  <span className="shrink-0 text-2xl font-semibold tabular-nums tracking-tight">
                    {p.completion_percentage}%
                  </span>
                </div>
                <ProgressBar
                  value={Number(p.completion_percentage)}
                  label={`${p.book_title} ilerlemesi`}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {p.completed_tests} / {p.total_tests} test tamamlandı · {p.remaining_tests} kaldı
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
