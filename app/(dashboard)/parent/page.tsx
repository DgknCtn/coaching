import { BookOpen, Users } from 'lucide-react'
import { isOverdue } from '@/lib/homework-status'
import { getParentContext } from '@/lib/workspace'
import { Badge } from '@/components/ui/badge'
import { BookCard } from '@/components/shared/book-card'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { MetricRow } from '@/components/shared/metric-row'
import { counterLabel, OVERDUE_HINT } from '@/lib/homework-status'
import { LinkTabs } from '@/components/shared/link-tabs'
import { ExplainerCards, type ExplainerCard } from '@/components/shared/explainer-cards'
import { AlertBanner } from '@/components/shared/alert-banner'
import { HomeworkBatchRow } from '@/components/shared/homework-batch-row'
import { buildHomeworkDetail, type HomeworkDetailItem } from '@/lib/homework-detail'
import { ParentTempoRow } from '@/components/shared/parent-tempo-row'

export const dynamic = 'force-dynamic'

// Velinin ekranı okumasını sağlayan kurallar. Diğer üç ekranla aynı kalıp.
const EXPLAINERS: ExplainerCard[] = [
  {
    title: 'Sayılar ne anlama geliyor?',
    items: [
      { text: '"Tamamlanan" yalnız öğretmenin onayladığı çalışmaları sayar.', tone: 'positive' },
      { text: '"Onay Bekleyen" öğrencinin gönderdiği ama henüz onaylanmamış çalışmadır; tamamlanan sayısına girmez.', tone: 'negative' },
      { text: '"Süresi Geçen" ayrı bir toplam değildir — bekleyenlerin içindeki teslim tarihi geçmiş kısımdır.' },
    ],
  },
  {
    title: 'Tempo nasıl okunur?',
    items: [
      { text: 'Her kaynak için hedef tarihe göre haftada ne kadar gerektiği yazar.' },
      { text: 'Hedef tarihi belirlenmemiş bir kaynakta tempo hesaplanamaz; o satırda yalnız kalan miktar görünür.' },
      { text: 'Video çalışmaları tempoya dahil edilmez.' },
    ],
  },
  {
    title: 'Bu panel ne yapmaz?',
    items: [
      { text: 'Buradan ödev verilemez, hedef değiştirilemez; panel yalnız görüntülemedir.' },
      { text: 'Öğrencinin konu planı ve tekrar listesi öğretmen ile öğrenci arasındadır, bu panelde yer almaz.' },
      { text: 'Bir gecikme gördüğünüzde öğretmenle iletişime geçmek en hızlı yoldur.' },
    ],
  },
]

/** Supabase iç içe select'i tek kayıt için de dizi tipinde çözebiliyor. */
type Nested<T> = T | T[] | null
function one<T>(value: Nested<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export default async function ParentPage({
  searchParams,
}: {
  /** Seçili öğrenci URL'de tutulur: paylaşılabilir ve geri tuşuyla gezilebilir. */
  searchParams: Promise<{ student?: string }>
}) {
  const { student: requestedStudentId } = await searchParams
  const { supabase, workspaceId, linkedStudents } = await getParentContext()


  // ÖNCEDEN: bağlı tüm öğrenciler tek sayfada alt alta diziliyordu. Üç
  // çocuklu bir velide sayfa taranamaz hâle geliyordu ve her çocuk için
  // üç sorgu birden çalışıyordu. Artık tek çocuğun detayı gösterilir;
  // geçiş sekmelerle yapılır ve tek çocukta sekme hiç görünmez.
  const activeStudentId =
    requestedStudentId && linkedStudents.some(l => l.students.id === requestedStudentId)
      ? requestedStudentId
      : (linkedStudents[0]?.students.id ?? null)

  const activeLinks = linkedStudents.filter(l => l.students.id === activeStudentId)

  const studentData = await Promise.all(
    activeLinks.map(async (link) => {
      const studentId = link.students.id

      const [
        { data: bookProgress },
        { data: batches },
        { data: weeklySummary },
        { data: teacherRow },
      ] = await Promise.all([
        supabase
          .from('student_book_progress_view')
          .select('*')
          .eq('student_id', studentId)
          .eq('workspace_id', workspaceId),
        supabase
          .from('homework_batches')
          .select(
            `id, title, description, due_date, status,
             homework_items(
               id, status, book_id, section_id,
               books(title, tracking_mode),
               book_sections(title),
               book_tests(order_index)
             )`
          )
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
        // Gecikme uyarısında "kime yazayım?" sorusunu yanıtlamak için.
        // profiles RLS'i veliye kapalıysa isim null döner ve uyarı genel
        // metne düşer — ekran bozulmaz.
        supabase
          .from('students')
          .select('profiles:primary_teacher_profile_id(full_name)')
          .eq('id', studentId)
          .maybeSingle(),
      ])

      return {
        student: link.students,
        bookProgress: bookProgress ?? [],
        batches: batches ?? [],
        weekly: weeklySummary,
        teacherName:
          one((teacherRow as { profiles: Nested<{ full_name: string }> } | null)?.profiles ?? null)
            ?.full_name ?? null,
      }
    })
  )

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-8">
      <PageHeader
        title="Veli Paneli"
        subtitle={
          linkedStudents.length > 1
            ? 'Öğrencilerinizin gelişimini takip edin'
            : 'Öğrencinizin gelişimini takip edin'
        }
      />

      {/* Tek çocukta sekme hiç çizilmez — gereksiz bir seçim sunmaz. */}
      {linkedStudents.length > 1 && activeStudentId && (
        <LinkTabs
          tabs={linkedStudents.map(l => ({
            key: l.students.id,
            label: l.students.full_name,
            href: `/parent?student=${l.students.id}`,
          }))}
          activeKey={activeStudentId}
        />
      )}

      {studentData.length === 0 && (
        <Section variant="card">
          <EmptyState
            icon={Users}
            title="Bağlı öğrenci yok"
            description="Öğretmeninizden davet bekleniyor."
          />
        </Section>
      )}

      {studentData.map(({ student, bookProgress, batches, weekly, teacherName }) => {
        const overdueBatches = batches.filter((b) => {
          return (
            isOverdue(b.due_date) &&
            (b.homework_items as { status: string }[]).some((i) => i.status === 'pending')
          )
        })

        // Genel (dönem geneli) ilerleme — atanmış tüm kitaplar üzerinden.
        const overallTotal = bookProgress.reduce((s, p) => s + Number(p.total_tests ?? 0), 0)
        const overallCompleted = bookProgress.reduce((s, p) => s + Number(p.completed_tests ?? 0), 0)
        const overallPct = overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : 0
        const hasActivity = bookProgress.length > 0 || batches.length > 0
        const onTrack = hasActivity && overdueBatches.length === 0

        return (
          <div key={student.id} className="space-y-6 border-t pt-8 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{student.full_name}</h2>
              {student.exam_type && <Badge variant="neutral">{student.exam_type}</Badge>}
              {student.grade_level && <Badge variant="neutral">{student.grade_level}</Badge>}
            </div>

            {overdueBatches.length > 0 && (
              <AlertBanner
                tone="warning"
                title={`${overdueBatches.length} gecikmiş ödev grubu`}
                description={
                  teacherName
                    ? `Teslim tarihi geçmiş çalışmalar var. ${teacherName} ile iletişime geçebilirsiniz.`
                    : 'Teslim tarihi geçmiş çalışmalar var. Öğretmenle iletişime geçebilirsiniz.'
                }
              />
            )}

            {onTrack && (
              <AlertBanner
                tone="success"
                title="Her şey yolunda"
                description="Gecikmiş ödev yok, güzel gidiyor."
              />
            )}

            {weekly && (
              <Section title="Bu hafta">
                <MetricRow
                  className="md:grid-cols-5"
                  metrics={[
                    { label: counterLabel('assigned', 'parent'), value: weekly.assigned_tests ?? 0 },
                    { label: counterLabel('completed', 'parent'), value: weekly.completed_tests ?? 0 },
                    { label: counterLabel('pending', 'parent'), value: weekly.pending_tests ?? 0 },
                    {
                      label: counterLabel('pendingApproval', 'parent'),
                      value: weekly.pending_approval_tests ?? 0,
                    },
                    {
                      label: counterLabel('overdue', 'parent'),
                      value: weekly.overdue_tests ?? 0,
                      hint: OVERDUE_HINT,
                    },
                  ]}
                />
              </Section>
            )}

            {hasActivity && (
              <Section title="Dönem geneli">
                <MetricRow
                  metrics={[
                    { label: 'Genel ilerleme', value: `${overallPct}%` },
                    {
                      label: 'Tamamlanan çalışma',
                      value: overallCompleted,
                      subValue: `/${overallTotal}`,
                    },
                    { label: 'Aktif kitap', value: bookProgress.length },
                  ]}
                  className="md:grid-cols-3"
                />
              </Section>
            )}

            {bookProgress.length > 0 && (
              <Section
                title="Plan ve tempo"
                description="Her kaynakta hedefe göre nerede olunduğu."
              >
                <div className="space-y-3">
                  {bookProgress.map((p) => (
                    <ParentTempoRow
                      key={p.student_book_assignment_id}
                      bookTitle={p.book_title}
                      startDate={p.start_date}
                      targetEndDate={p.target_end_date}
                      totalUnits={Number(p.total_tests ?? 0)}
                      completedUnits={Number(p.completed_tests ?? 0)}
                      trackingMode={p.tracking_mode}
                    />
                  ))}
                </div>
              </Section>
            )}

            {bookProgress.length > 0 && (
              <Section title="Kitap ilerlemesi">
                <div className="grid gap-3 sm:grid-cols-2">
                  {bookProgress.map((p) => (
                    <BookCard
                      key={p.student_book_assignment_id}
                      href={`/parent/students/${student.id}/books/${p.book_id}`}
                      book={{
                        id: p.book_id,
                        title: p.book_title,
                        subject: p.subject,
                        tracking_mode: p.tracking_mode,
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
              </Section>
            )}

            {batches.length > 0 && (
              <Section title="Son ödevler" variant="card">
                <ul className="divide-y">
                  {batches.slice(0, 5).map((batch) => {
                    const items = batch.homework_items as unknown as {
                      id: string
                      status: string
                      book_id: string | null
                      section_id: string | null
                      books: Nested<{ title: string; tracking_mode: string }>
                      book_sections: Nested<{ title: string }>
                      book_tests: Nested<{ order_index: number }>
                    }[]
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
                    const total = items.filter((i) => i.status !== 'cancelled').length
                    const completed = items.filter((i) => i.status === 'completed').length
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
                          dateStyle={{ day: 'numeric', month: 'long' }}
                        />
                      </li>
                    )
                  })}
                </ul>
              </Section>
            )}

            {bookProgress.length === 0 && batches.length === 0 && !weekly && (
              <Section variant="card">
                <EmptyState
                  icon={BookOpen}
                  title="Henüz veri yok"
                  description="Öğretmen henüz kitap veya ödev atamamış."
                />
              </Section>
            )}
          </div>
        )
      })}

      {studentData.length > 0 && <ExplainerCards cards={EXPLAINERS} />}
    </div>
  )
}
