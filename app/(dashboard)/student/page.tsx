import Link from 'next/link'
import { isOverdue } from '@/lib/homework-status'
import { unitLabel } from '@/lib/unit-labels'
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

  // Ödevler, kitap ilerlemesi ve bildirim materyalizasyonu birbirinden
  // bağımsız — tek dalgada çalışırlar.
  const [{ data: batches }, { data: bookProgress }] = await Promise.all([
    supabase
      .from('homework_batches')
      .select(`
        id, title, description, due_date, status,
        homework_items(
          id, status, completed_at, teacher_note, rejected_at, submitted_at, book_id,
          books(title, subject, tracking_mode),
          book_sections(title),
          book_tests(title)
        )
      `)
      .eq('student_id', student.id)
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('due_date', { ascending: true }),
    supabase
      .from('student_book_progress_view')
      .select('*')
      .eq('student_id', student.id)
      .eq('workspace_id', workspaceId),
    // Sonucu okunmuyor ama aşağıdaki sorgudan ÖNCE bitmeli (yazdığı satırı
    // o okuyor) — bu yüzden bu dalganın içinde, sonrakinden önce.
    supabase.rpc('ensure_student_check_ins', { p_workspace_id: workspaceId }),
  ])

  // Açık durum bildirimi (varsa) — süresi gelen tek kayıt.
  const { data: openCheckIn } = await supabase
    .from('student_check_ins')
    .select('id, due_at')
    .eq('student_id', student.id)
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(1)
    .maybeSingle()


  const overdue = (batches ?? []).filter(b => {
    return (
      isOverdue(b.due_date) &&
      (b.homework_items as { status: string }[]).some(i => i.status === 'pending')
    )
  })
  const upcoming = (batches ?? []).filter(b => !isOverdue(b.due_date))

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
              <Link
                key={p.student_book_assignment_id}
                href={`/student/books/${p.book_id}`}
                className="block rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20"
              >
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
                  {p.completed_tests} / {p.total_tests} {unitLabel(p.tracking_mode)} tamamlandı ·{' '}
                  {p.remaining_tests} kaldı
                </p>
                <p className="mt-1 text-xs text-primary">Kitap haritasını gör →</p>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
