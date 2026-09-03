import Link from 'next/link'
import { isOverdue } from '@/lib/homework-status'
import { buildHomeworkDetail, type HomeworkDetailItem } from '@/lib/homework-detail'
import { AcademicNotesPanel, type AcademicNote } from './academic-notes-panel'
import { notFound } from 'next/navigation'
import {
  Plus,
  BookOpen,
  ClipboardList,
  Users,
  StickyNote,
  FileText,
  MessageSquareDashed,
  Pencil,
  CircleCheck,
  CircleAlert,
  Hourglass,
  UserRound,
  History,
  Crosshair,
  ArrowRight,
} from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AssignBookDialog } from './assign-book-dialog'
import { loadAssignableBooks } from '@/lib/assignable-books'
import { InviteDialog } from './invite-dialog'
import { PendingApprovalList } from './pending-approval-list'
import { CheckInScheduleForm } from './check-in-panel'
import { formatRelativeTime, moodLabel } from '@/lib/student-attention'
import { BookCard } from '@/components/shared/book-card'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { COUNTER_LABEL, OVERDUE_HINT } from '@/lib/homework-status'
import { Section } from '@/components/shared/section'
import { HomeworkBatchRow } from '@/components/shared/homework-batch-row'
import { R5SummaryCards } from '@/components/shared/r5-summary-cards'
import { loadBookMap } from '@/lib/book-map'
import { resolvePlanScope } from '@/lib/plan-scope'
import { bookPlanGroup } from '@/lib/resource-plan'
import { buildProtectionPool } from '@/lib/protection-pool'
import {
  buildAcademicTrail,
  buildWeeklyFocus,
  summarizeAcademicFlow,
  summarizeProtectionPool,
  summarizeResourcePlan,
  type FlowSummaryItem,
  type ResourceSummaryItem,
} from '@/lib/student-overview'
import { formatUnitCount } from '@/lib/unit-labels'

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
    { data: weeklySummary },
    { data: pendingApprovalSummary },
    { data: overdueSummary },
    { data: academicNoteRows },
    { data: flowRows },
    { data: contactRows },
    { data: openWorkRows },
    { data: overrideRows },
    r5Books,
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
    // R5.5: üç özet kartın verisi. Hepsi opsiyoneldir — R5 verisi olmayan
    // öğrencide boş döner ve kartlar nötr boş durum gösterir (OG-07).
    supabase
      .from('student_curriculum_items')
      .select('topic_id, scope_id, start_date, end_date, passed_at, topics(name), academic_scopes(name)')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    supabase
      .from('student_topic_contact_view')
      .select('topic_id, last_contact_date, last_contact_source, last_contact_amount')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    supabase
      .from('student_topic_open_work_view')
      .select('topic_id, open_items')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    supabase
      .from('student_topic_overrides')
      .select('topic_id, keep_active')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    // Kaynak Planı özeti kapsam-duyarlı olmalı: Plan % ana göstergedir
    // (OG-04), o da hedef kapsamından hesaplanır.
    loadBookMap(supabase, {
      workspaceId,
      studentId,
      statuses: ['active', 'pending', 'paused', 'completed'],
    }),
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

  // ============================================================
  // R5.5 — üç özet kartın verisi
  //
  // Hesaplama lib/student-overview.ts'te; burası yalnız satırları
  // biçime çevirir. R5 verisi yoksa hepsi boş döner ve kartlar nötr
  // boş durum gösterir; ekran kırılmaz (OG-07).
  // ============================================================
  const flowItems: FlowSummaryItem[] = (
    (flowRows ?? []) as unknown as {
      topic_id: string
      scope_id: string
      start_date: string
      end_date: string
      passed_at: string | null
      topics: Nested<{ name: string }>
      academic_scopes: Nested<{ name: string }>
    }[]
  ).map(r => ({
    topicId: r.topic_id,
    topicName: one(r.topics)?.name ?? 'Konu',
    scopeId: r.scope_id,
    scopeName: one(r.academic_scopes)?.name ?? 'Kapsam',
    startDate: r.start_date,
    endDate: r.end_date,
    passed: r.passed_at !== null,
  }))

  const flowSummary = summarizeAcademicFlow(flowItems)

  const resourceSummary = summarizeResourcePlan(
    (r5Books as Awaited<ReturnType<typeof loadBookMap>>).map<ResourceSummaryItem>(b => {
      const scope = resolvePlanScope(b)
      return {
        bookId: b.bookId,
        title: b.title,
        group: bookPlanGroup(b.status),
        planPercentage: scope.percentage,
        bookPercentage: scope.bookPercentage,
        // Sunum alanları (özet hesabına girmez): tablo satırındaki rozet ve
        // kapsam metni. Birim adı kaynağın takip türünden gelir.
        role: b.role,
        status: b.status,
        scopeLabel: formatUnitCount(scope.totalUnits, b.trackingMode),
      }
    })
  )

  // Havuz, akıştaki konularla sınırlıdır (KH-17) — detay ekranıyla aynı kural.
  const contactByTopic = new Map(
    (
      (contactRows ?? []) as {
        topic_id: string
        last_contact_date: string
        last_contact_source: string
        last_contact_amount: number
      }[]
    ).map(r => [r.topic_id, r])
  )
  const openByTopic = new Map(
    ((openWorkRows ?? []) as { topic_id: string; open_items: number }[]).map(r => [
      r.topic_id,
      r.open_items,
    ])
  )
  const overrideByTopic = new Map(
    ((overrideRows ?? []) as { topic_id: string; keep_active: boolean }[]).map(r => [
      r.topic_id,
      r.keep_active,
    ])
  )

  const poolSummary = summarizeProtectionPool(
    buildProtectionPool(
      [...new Map(flowItems.map(f => [f.topicId, f])).values()].map(f => {
        const contact = contactByTopic.get(f.topicId)
        return {
          topicId: f.topicId,
          topicName: f.topicName,
          scopeId: f.scopeId,
          scopeName: f.scopeName,
          lastContactDate: contact?.last_contact_date ?? null,
          lastContactSource:
            (contact?.last_contact_source as 'homework' | 'lesson' | 'self_study' | null) ?? null,
          lastContactAmount: Number(contact?.last_contact_amount ?? 0),
          openWorkCount: Number(openByTopic.get(f.topicId) ?? 0),
          keepActive: overrideByTopic.get(f.topicId) === true,
          bookTitles: [],
        }
      })
    ).map(r => ({
      topicId: r.topicId,
      topicName: r.topicName,
      daysSinceContact: r.daysSinceContact,
    }))
  )

  // Son Akademik İz ve Bu Hafta Odak: ikisi de SAYFANIN ZATEN ÇEKTİĞİ
  // kümelerden türer, yeni sorgu yoktur (lib/student-overview.ts).
  const academicTrail = buildAcademicTrail({
    notes: academicNotes.map(n => ({
      id: n.id,
      note_text: n.note_text,
      created_at: n.created_at,
      author_name: n.author_name,
    })),
    homework: (homeworkBatches ?? []).map(batch => {
      const items = (batch.homework_items as unknown as { status: string }[]) ?? []
      return {
        id: batch.id,
        title: batch.title,
        due_date: batch.due_date,
        itemCount: items.length,
        completedCount: items.filter(i => i.status === 'completed').length,
      }
    }),
  })

  const weeklyFocus = buildWeeklyFocus({
    studentId,
    pendingApproval: pendingApprovalSummary?.pending_approval_items ?? 0,
    overdue: overdueSummary?.overdue_items ?? 0,
    pool: poolSummary,
    resources: resourceSummary,
  })

  // Atanabilir kitap listesi Kaynak Planı ekranıyla ORTAK yükleyiciden gelir;
  // iki ekran aynı listeyi göstermek zorunda (lib/assignable-books.ts).
  const availableBooks = await loadAssignableBooks(supabase, {
    workspaceId,
    termId: activeTerm?.id ?? null,
    assignedBookIds: (bookProgress ?? []).map(p => p.book_id),
  })

  const hasAccount = !!student.profile_id

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
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
        // Akış / Kaynak Planı / Koruma / Rapor artık sol menünün öğrenci
        // grubunda; başlıkta yalnız bu ekranın kendi eylemleri kalıyor.
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
        <MetricTiles
          className="xl:grid-cols-5"
          metrics={[
            {
              label: COUNTER_LABEL.assigned,
              value: weeklySummary.assigned_tests ?? 0,
              icon: ClipboardList,
            },
            {
              label: COUNTER_LABEL.completed,
              value: weeklySummary.completed_tests ?? 0,
              tone: 'success',
              icon: CircleCheck,
            },
            {
              label: COUNTER_LABEL.pending,
              value: weeklySummary.pending_tests ?? 0,
              tone: 'warning',
              icon: UserRound,
            },
            // R6-10: sayaçlar Görevler'i BU ÖĞRENCİYE daraltarak açar.
            // Global sayaçlar (dashboard) öğrenci parametresi taşımaz.
            {
              label: COUNTER_LABEL.pendingApproval,
              value: pendingApprovalSummary?.pending_approval_items ?? 0,
              tone: 'info',
              icon: Hourglass,
              href: `/teacher/tasks?filter=approval&student=${studentId}`,
            },
            {
              label: COUNTER_LABEL.overdue,
              value: overdueSummary?.overdue_items ?? 0,
              tone: 'destructive',
              icon: CircleAlert,
              hint: OVERDUE_HINT,
              href: `/teacher/tasks?filter=overdue&student=${studentId}`,
            },
          ]}
        />
      )}

      {/* R5.5: üç sistemin nabzı. Mevcut R4 operasyon sayaçları
          (yukarıda) AYRI KATMANDIR ve bu bloktan etkilenmez (OG-09). */}
      <R5SummaryCards
        studentId={studentId}
        flow={flowSummary}
        resources={resourceSummary}
        pool={poolSummary}
      />

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

      {/* Son Akademik İz + Bu Hafta Odak.
          İkisi de mevcut veriden türer: iz notlar ve ödevlerden, odak ise
          onay bekleyen / süresi geçen / havuz / plan sinyallerinden. Hiçbir
          sinyal yoksa ilgili blok HİÇ GÖSTERİLMEZ — sistem görev uydurmaz
          (R6-07 kabul #49 ile aynı ilke). */}
      {(academicTrail.length > 0 || weeklyFocus.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {academicTrail.length > 0 && (
            <section className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                >
                  <History className="size-3.5" />
                </span>
                <div>
                  <h2 className="text-sm font-medium">Son Akademik İz</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Son çalışmalar ve akademik notlar
                  </p>
                </div>
              </div>

              <ol className="space-y-3">
                {academicTrail.map(entry => (
                  <li key={entry.id} className="flex gap-3">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                    <div className="min-w-0">
                      <p className="text-sm">{entry.text}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(entry.date).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'long',
                        })}
                        {entry.detail ? ` · ${entry.detail}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {weeklyFocus.length > 0 && (
            <section className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                >
                  <Crosshair className="size-3.5" />
                </span>
                <div>
                  <h2 className="text-sm font-medium">Bu Hafta Odak</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Mevcut sinyallerden çıkan başlıklar
                  </p>
                </div>
              </div>

              <ul className="space-y-2">
                {weeklyFocus.map(item => (
                  <li key={item.id}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                      >
                        <span className="min-w-0 truncate">{item.text}</span>
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                      </Link>
                    ) : (
                      <span className="block px-2 py-1.5 text-sm">{item.text}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
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
