import Link from 'next/link'
import { isOverdue } from '@/lib/homework-status'
import { buildHomeworkDetail, type HomeworkDetailItem } from '@/lib/homework-detail'
import { AcademicNotesPanel, type AcademicNote } from './academic-notes-panel'
import type { AssignableBook } from './assign-book-dialog'
import { notFound } from 'next/navigation'
import { Plus, BookOpen, ClipboardList, Users, StickyNote, FileText, Target, MessageSquareDashed, Pencil } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AssignBookDialog } from './assign-book-dialog'
import { InviteDialog } from './invite-dialog'
import { PendingApprovalList } from './pending-approval-list'
import { CheckInScheduleForm } from './check-in-panel'
import { formatRelativeTime, moodLabel } from '@/lib/student-attention'
import { BookCard } from '@/components/shared/book-card'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { MetricRow } from '@/components/shared/metric-row'
import { COUNTER_LABEL, OVERDUE_HINT } from '@/lib/homework-status'
import { Section } from '@/components/shared/section'
import { HomeworkBatchRow } from '@/components/shared/homework-batch-row'

export const dynamic = 'force-dynamic'

/** Supabase iç içe select'i tek kayıt için de dizi tipinde çözebiliyor. */
type Nested<T> = T | T[] | null
function one<T>(value: Nested<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

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

  // Buradan sonraki sorguların hiçbiri diğerinin sonucuna ihtiyaç duymuyor;
  // sıralı beklemek sayfa açılışına doğrudan 10 gidiş-dönüş ekliyordu.
  // Tek dalgada çalışırlar — dönen veriler ve aşağıdaki hesaplar aynı.
  //
  // Tek incelik: "atanabilir kitaplar" listesi bookProgress'e göre
  // FİLTRELENİYOR ama sorgusu ondan bağımsız. Bu yüzden sorgu paralel
  // çalışır, eleme sonuçlar geldikten sonra yapılır (aşağıda).
  const [
    { data: bookProgress },
    { data: checkInSchedule },
    { data: checkIns },
    { data: homeworkBatches },
    { data: pendingApprovalItems },
    { data: parentLinks },
    { data: termBooks },
    { data: weeklySummary },
    { data: pendingApprovalSummary },
    { data: overdueSummary },
    { data: academicNoteRows },
  ] = await Promise.all([
    supabase
      .from('student_book_progress_view')
      .select('*')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    supabase
      .from('student_check_in_schedules')
      .select('interval_days, is_active')
      .eq('student_id', studentId)
      .maybeSingle(),
    supabase
      .from('student_check_ins')
      .select('id, due_at, submitted_at, status, mood, message')
      .eq('student_id', studentId)
      .order('due_at', { ascending: false })
      .limit(10),
    supabase
      .from('homework_batches')
      .select(`
        id, title, description, due_date, status,
        homework_items(
          id, status, book_id, section_id,
          books(title, tracking_mode),
          book_sections(title),
          book_tests(order_index)
        )
      `)
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('due_date', { ascending: false })
      .limit(20),
    supabase
      .from('homework_items')
      .select(`
        id, book_id, homework_batch_id,
        books(title, tracking_mode),
        book_sections(title),
        book_tests(title),
        homework_batches!inner(student_id, workspace_id, title, due_date)
      `)
      .eq('status', 'pending_approval')
      .eq('homework_batches.student_id', studentId)
      .eq('homework_batches.workspace_id', workspaceId),
    supabase
      .from('parent_student_links')
      .select('id, relationship_type, status, parent_profile_id, profiles(full_name, email)')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .neq('status', 'removed'),
    // Aktif dönem yoksa sorgu hiç yapılmaz (önceki davranışla aynı).
    activeTerm
      ? supabase
          .from('books')
          // R6-15: arama ve filtre için ek metadata.
          .select('id, title, subject, publisher, level_exam, edition_year, curriculum_program')
          .eq('workspace_id', workspaceId)
          .eq('academic_term_id', activeTerm.id)
          .eq('status', 'active')
      : Promise.resolve({ data: null }),
    supabase
      .from('student_weekly_homework_summary_view')
      .select('*')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    // "Onay Bekleyen" ve "Süresi Geçen" hafta penceresinden BAĞIMSIZ sayılır.
    // weeklySummary yalnız bu haftaya düşen batch'leri görür; oysa yukarıdaki
    // pendingApprovalItems listesi (ve /teacher/tasks) tüm haftaları kapsıyor.
    // 017 bu düzeltmeyi dashboard'a uygulamıştı, bu sayfa atlanmıştı — sayaç
    // "2" derken altındaki liste 5 satır gösterebiliyordu.
    supabase
      .from('student_pending_approval_view')
      .select('pending_approval_items')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase
      .from('student_overdue_homework_view')
      .select('overdue_items')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    // Akademik Not (R6-07). RLS gereği bu sorgu yalnız eğitmen oturumunda
    // satır döndürür; öğrenci/veli için politika tanımlı değildir.
    supabase
      .from('academic_notes')
      .select('id, note_text, pinned, created_at, profiles(full_name)')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const academicNotes: AcademicNote[] = ((academicNoteRows ?? []) as unknown as {
    id: string
    note_text: string
    pinned: boolean
    created_at: string
    profiles: Nested<{ full_name: string | null }>
  }[]).map(row => ({
    id: row.id,
    note_text: row.note_text,
    pinned: row.pinned,
    created_at: row.created_at,
    author_name: one(row.profiles)?.full_name ?? null,
  }))

  const lastAcademicNote = academicNotes.find(n => n.pinned) ?? academicNotes[0] ?? null

  const assignedBookIds = (bookProgress ?? []).map(p => p.book_id)
  const availableBooks: AssignableBook[] = ((termBooks ?? []) as AssignableBook[]).filter(
    b => !assignedBookIds.includes(b.id)
  )

  const hasAccount = !!student.profile_id

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 md:p-8">
      <PageHeader
        backHref="/teacher/students"
        title={student.full_name}
        subtitle={
          [student.grade_level, student.email, student.phone]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        badges={
          student.exam_type ? <Badge variant="neutral">{student.exam_type}</Badge> : undefined
        }
        action={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/teacher/students/${studentId}/edit`} />}
            >
              <Pencil />
              Düzenle
            </Button>
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
            { label: COUNTER_LABEL.assigned, value: weeklySummary.assigned_tests ?? 0 },
            { label: COUNTER_LABEL.completed, value: weeklySummary.completed_tests ?? 0 },
            { label: COUNTER_LABEL.pending, value: weeklySummary.pending_tests ?? 0 },
            // R6-10: sayaçlar Görevler'i BU ÖĞRENCİYE daraltarak açar.
            // Global sayaçlar (dashboard) öğrenci parametresi taşımaz.
            {
              label: COUNTER_LABEL.pendingApproval,
              value: pendingApprovalSummary?.pending_approval_items ?? 0,
              href: `/teacher/tasks?filter=approval&student=${studentId}`,
            },
            {
              label: COUNTER_LABEL.overdue,
              value: overdueSummary?.overdue_items ?? 0,
              hint: OVERDUE_HINT,
              href: `/teacher/tasks?filter=overdue&student=${studentId}`,
            },
          ]}
        />
      )}

      {/* Son Akademik Not (R6-07 kabul #48): tarih + kısa metin. Tüm notlar
          Akademik Not sekmesinde kronolojik listelenir. Not yoksa BURASI HİÇ
          GÖRÜNMEZ — sistem uyarı veya görev üretmez (#49). */}
      {lastAcademicNote && (
        <div className="rounded-lg border bg-card px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              {lastAcademicNote.pinned ? 'Önemli akademik not' : 'Son akademik not'}
            </p>
            <p className="shrink-0 text-[11px] text-muted-foreground">
              {new Date(lastAcademicNote.created_at).toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <p className="mt-1 line-clamp-2 text-sm">{lastAcademicNote.note_text}</p>
        </div>
      )}

      <Tabs defaultValue="books">
        <TabsList className="mb-6">
          <TabsTrigger value="books">
            <BookOpen /> Kitaplar
          </TabsTrigger>
          <TabsTrigger value="homework">
            <ClipboardList /> Ödevler
          </TabsTrigger>
          <TabsTrigger value="checkin">
            <MessageSquareDashed /> Durum
          </TabsTrigger>
          <TabsTrigger value="parents">
            <Users /> Veliler
          </TabsTrigger>
          {/* R6-07: sekme artık koşulsuz. Eskiden yalnız students.notes
              doluysa görünüyordu ve not eklemenin tek yolu öğrenci
              oluşturma formuydu. */}
          <TabsTrigger value="notes">
            <StickyNote /> Akademik Not
          </TabsTrigger>
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
                      tracking_mode: p.tracking_mode,
                    }}
                    progress={{
                      completed: p.completed_tests,
                      total: p.total_tests,
                      percentage: Number(p.completion_percentage),
                      targetDate: p.target_end_date,
                    }}
                    href={`/teacher/students/${studentId}/books/${p.book_id}`}
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
                book_id: item.book_id ?? null,
                homework_batch_id: item.homework_batch_id,
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
                    // Supabase iç içe select'i tek kaydı da dizi tipinde
                    // çözebiliyor; okurken tekile indiriyoruz.
                    const items =
                      (batch.homework_items as unknown as {
                        id: string
                        status: string
                        book_id: string | null
                        section_id: string | null
                        books: Nested<{ title: string; tracking_mode: string }>
                        book_sections: Nested<{ title: string }>
                        book_tests: Nested<{ order_index: number }>
                      }[]) ?? []
                    const total = items.length
                    const completed = items.filter((i) => i.status === 'completed').length
                    // R6-06: detay assignment_items'tan türetilir; ödev
                    // kaydında ayrı bir kopya metin tutulmaz.
                    const detail = buildHomeworkDetail(
                      items.map<HomeworkDetailItem>((i) => ({
                        bookId: i.book_id,
                        bookTitle: one(i.books)?.title ?? null,
                        trackingMode: one(i.books)?.tracking_mode ?? null,
                        sectionId: i.section_id,
                        sectionTitle: one(i.book_sections)?.title ?? null,
                        orderIndex: one(i.book_tests)?.order_index ?? null,
                      }))
                    )
                    // R6-02: teslim gününün tamamı kullanılabilir. Gecikme
                    // kararı lib/homework-status.ts'ten gelir.
                    const batchOverdue =
                      isOverdue(batch.due_date) && items.some((i) => i.status === 'pending')
                    return (
                      <li key={batch.id}>
                        <HomeworkBatchRow
                          title={batch.title}
                          dueDate={batch.due_date}
                          completed={completed}
                          total={total}
                          isOverdue={batchOverdue}
                          detail={detail}
                          note={batch.description}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="checkin">
          <Section
            title="Durum bildirimi"
            description="Öğrencinin planlı bildirimleri ve son temas geçmişi."
          >
            <div className="space-y-4">
              <CheckInScheduleForm
                studentId={studentId}
                intervalDays={checkInSchedule?.interval_days ?? 3}
                isActive={checkInSchedule?.is_active ?? false}
              />

              {(checkIns?.length ?? 0) > 0 ? (
                <div className="divide-y rounded-lg border bg-card">
                  {checkIns!.map((c) => (
                    <div key={c.id} className="flex items-start justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {c.status === 'submitted' ? moodLabel(c.mood) : 'Cevap bekleniyor'}
                        </p>
                        {c.message && (
                          <p className="mt-1 text-sm text-muted-foreground">{c.message}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.status === 'submitted'
                          ? formatRelativeTime(c.submitted_at)
                          : `Beklenen: ${new Date(c.due_at).toLocaleDateString('tr-TR')}`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={MessageSquareDashed}
                  title="Henüz durum bildirimi yok"
                  description="Bir periyot belirlediğinde ilk bildirim otomatik planlanır."
                />
              )}
            </div>
          </Section>
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

        <TabsContent value="notes">
          <Section
            title="Akademik Not / Öğrenci Hafızası"
            description="Derse başlarken hatırlamak istedikleriniz. Yalnız eğitmenlere görünür; öğrenci ve veli panelinde yer almaz."
          >
            <AcademicNotesPanel studentId={studentId} notes={academicNotes} />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
