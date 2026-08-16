import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus, BookOpen, ClipboardList, Users, StickyNote, FileText, Target } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AssignBookDialog } from './assign-book-dialog'
import { InviteDialog } from './invite-dialog'
import { PendingApprovalList } from './pending-approval-list'
import { BookCard } from '@/components/shared/book-card'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { MetricRow } from '@/components/shared/metric-row'
import { Section } from '@/components/shared/section'
import { HomeworkBatchRow } from '@/components/shared/homework-batch-row'

export const dynamic = 'force-dynamic'

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const { supabase, workspaceId, activeTerm } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, email, phone, grade_level, exam_type, notes, status, profile_id')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student || student.status === 'archived') notFound()

  const { data: bookProgress } = await supabase
    .from('student_book_progress_view')
    .select('*')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)

  const { data: homeworkBatches } = await supabase
    .from('homework_batches')
    .select(`
      id, title, due_date, status,
      homework_items(id, status)
    `)
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .order('due_date', { ascending: false })
    .limit(20)

  const { data: pendingApprovalItems } = await supabase
    .from('homework_items')
    .select(`
      id,
      books(title),
      book_sections(title),
      book_tests(title),
      homework_batches!inner(student_id, workspace_id)
    `)
    .eq('status', 'pending_approval')
    .eq('homework_batches.student_id', studentId)
    .eq('homework_batches.workspace_id', workspaceId)

  const { data: parentLinks } = await supabase
    .from('parent_student_links')
    .select('id, relationship_type, status, parent_profile_id, profiles(full_name, email)')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .neq('status', 'removed')

  const assignedBookIds = (bookProgress ?? []).map(p => p.book_id)
  let availableBooks: { id: string; title: string; subject: string }[] = []
  if (activeTerm) {
    const { data } = await supabase
      .from('books')
      .select('id, title, subject')
      .eq('workspace_id', workspaceId)
      .eq('academic_term_id', activeTerm.id)
      .eq('status', 'active')
    availableBooks = (data ?? []).filter(b => !assignedBookIds.includes(b.id))
  }

  const { data: weeklySummary } = await supabase
    .from('student_weekly_homework_summary_view')
    .select('*')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  const hasAccount = !!student.profile_id

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 md:p-8">
      <PageHeader
        backHref="/teacher/students"
        title={student.full_name}
        subtitle={[student.email, student.phone].filter(Boolean).join(' · ')}
        badges={
          <>
            {student.exam_type && <Badge variant="neutral">{student.exam_type}</Badge>}
            {student.grade_level && <Badge variant="neutral">{student.grade_level}</Badge>}
          </>
        }
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/teacher/students/${studentId}/goals`} />}
            >
              <Target />
              Hedef
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/teacher/students/${studentId}/report`} />}
            >
              <FileText />
              Rapor
            </Button>
            <Button
              size="sm"
              render={<Link href={`/teacher/students/${studentId}/homework/new`} />}
            >
              <Plus />
              Ödev Ver
            </Button>
          </div>
        }
      />

      {weeklySummary && (
        <MetricRow
          className="md:grid-cols-5"
          metrics={[
            { label: 'Verilen', value: weeklySummary.assigned_tests ?? 0 },
            { label: 'Tamamlanan', value: weeklySummary.completed_tests ?? 0 },
            { label: 'Bekleyen', value: weeklySummary.pending_tests ?? 0 },
            { label: 'Onay bekliyor', value: weeklySummary.pending_approval_tests ?? 0 },
            { label: 'Geciken', value: weeklySummary.overdue_tests ?? 0 },
          ]}
        />
      )}

      <Tabs defaultValue="books">
        <TabsList className="mb-6">
          <TabsTrigger value="books">
            <BookOpen /> Kitaplar
          </TabsTrigger>
          <TabsTrigger value="homework">
            <ClipboardList /> Ödevler
          </TabsTrigger>
          <TabsTrigger value="parents">
            <Users /> Veliler
          </TabsTrigger>
          {student.notes && (
            <TabsTrigger value="notes">
              <StickyNote /> Notlar
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="books">
          <Section
            title="Atanmış kitaplar"
            action={
              activeTerm && availableBooks.length > 0 ? (
                <AssignBookDialog studentId={studentId} books={availableBooks} />
              ) : undefined
            }
          >
            {!bookProgress?.length ? (
              <div className="rounded-lg border bg-card">
                <EmptyState
                  icon={BookOpen}
                  title="Henüz kitap atanmamış"
                  description={
                    activeTerm && availableBooks.length > 0
                      ? 'Kitap eklemek için "Kitap Ata" butonunu kullanın.'
                      : !activeTerm
                      ? 'Önce aktif bir dönem oluşturun.'
                      : 'Bu dönemdeki tüm kitaplar atanmış.'
                  }
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {bookProgress.map((p) => (
                  <BookCard
                    key={p.student_book_assignment_id}
                    book={{
                      id: p.book_id,
                      title: p.book_title,
                      subject: p.subject,
                      exam_type: p.exam_type,
                    }}
                    progress={{
                      completed: p.completed_tests,
                      total: p.total_tests,
                      percentage: Number(p.completion_percentage),
                      targetDate: p.target_end_date,
                    }}
                    href={`/teacher/books/${p.book_id}`}
                  />
                ))}
              </div>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="homework">
          <div className="space-y-8">
            <PendingApprovalList
              studentId={studentId}
              items={(pendingApprovalItems ?? []).map((item) => ({
                id: item.id,
                books: item.books as unknown as { title: string } | null,
                book_sections: item.book_sections as unknown as { title: string } | null,
                book_tests: item.book_tests as unknown as { title: string } | null,
              }))}
            />

            <Section
              title="Ödevler"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href={`/teacher/students/${studentId}/homework/new`} />}
                >
                  <Plus />
                  Ödev Ver
                </Button>
              }
            >
              {!homeworkBatches?.length ? (
                <div className="rounded-lg border bg-card">
                  <EmptyState
                    icon={ClipboardList}
                    title="Henüz ödev yok"
                    description="Bu öğrenciye ödev vererek takip etmeye başlayın."
                    action={{
                      label: 'Ödev Ver',
                      href: `/teacher/students/${studentId}/homework/new`,
                    }}
                  />
                </div>
              ) : (
                <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                  {homeworkBatches.map((batch) => {
                    const items = (batch.homework_items as { id: string; status: string }[]) ?? []
                    const total = items.length
                    const completed = items.filter((i) => i.status === 'completed').length
                    const isOverdue =
                      new Date(batch.due_date) < new Date() &&
                      items.some((i) => i.status === 'pending')
                    return (
                      <li key={batch.id}>
                        <HomeworkBatchRow
                          title={batch.title}
                          dueDate={batch.due_date}
                          completed={completed}
                          total={total}
                          isOverdue={isOverdue}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="parents">
          <Section
            title="Veliler"
            action={
              <div className="flex items-center gap-2">
                {!hasAccount && (
                  <InviteDialog
                    studentId={studentId}
                    studentName={student.full_name}
                    inviteType="student"
                  />
                )}
                <InviteDialog
                  studentId={studentId}
                  studentName={student.full_name}
                  inviteType="parent"
                />
              </div>
            }
          >
            {!parentLinks?.length ? (
              <div className="rounded-lg border bg-card">
                <EmptyState
                  icon={Users}
                  title="Bağlı veli yok"
                  description="Veli davet ederek takip sürecine dahil edin."
                />
              </div>
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                {parentLinks.map((link) => {
                  const prof = link.profiles as unknown as {
                    full_name: string
                    email: string
                  } | null
                  return (
                    <li key={link.id} className="flex items-center justify-between gap-4 p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                          <span className="text-xs font-medium text-muted-foreground">
                            {(prof?.full_name ?? 'V').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {prof?.full_name ?? 'Davet bekleniyor'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {prof?.email ?? ''}
                          </p>
                        </div>
                      </div>
                      <Badge variant={link.status === 'active' ? 'success' : 'neutral'}>
                        {link.status === 'active'
                          ? 'Aktif'
                          : link.status === 'invited'
                          ? 'Davet edildi'
                          : link.status}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
        </TabsContent>

        {student.notes && (
          <TabsContent value="notes">
            <div className="rounded-lg border bg-card p-6">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{student.notes}</p>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
