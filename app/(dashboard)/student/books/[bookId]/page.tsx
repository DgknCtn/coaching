import { notFound } from 'next/navigation'
import { unitLabel } from '@/lib/unit-labels'
import { BookOpen, CircleCheck, UserRound, Hourglass, CircleAlert, CircleDashed } from 'lucide-react'
import { getStudentContext } from '@/lib/workspace'
import { loadBookMap } from '@/lib/book-map'
import { resolvePlanScope } from '@/lib/plan-scope'
import { COUNTER_LABEL } from '@/lib/homework-status'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { TempoStrip } from '@/components/shared/tempo-strip'
import { ProgressSummary } from '@/components/shared/progress-summary'
import { BookMapGrid, BookMapLegend } from '@/components/shared/book-map-grid'
import { StudentBookVideos } from './book-videos'

export const dynamic = 'force-dynamic'

/**
 * Öğrencinin kendi kitap haritası — SALT OKUNUR.
 *
 * Ödev atama yalnız öğretmen ekranında yapılır; buradaki harita seçim
 * yapmaz. RLS zaten öğrencinin yalnız kendi kayıtlarını okumasına izin
 * veriyor (is_student_self), ek bir yetki katmanı gerekmiyor.
 */
export default async function StudentBookMapPage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId } = await params
  const { supabase, student, workspaceId } = await getStudentContext()

  const [book] = await loadBookMap(supabase, {
    workspaceId,
    studentId: student.id,
    bookIds: [bookId],
  })

  // Kitap bu öğrenciye atanmamışsa gösterilecek bir bağlam yok.
  if (!book) notFound()

  // Video kaynakları ve öğrencinin "izledim" işaretleri (R4 §6).
  const { data: watchRows } = await supabase
    .from('video_watch_marks')
    .select('section_id')
    .eq('student_book_assignment_id', book.assignmentId)

  // Öğretmenin belirlediği hedef kapsamı öğrencide de aynı sayıları
  // göstermeli (R3 v2 "Tutarlılık"): tempo ve ilerleme aynı kaynaktan.
  const scope = resolvePlanScope(book)

  let completed = 0
  let assigned = 0
  let pendingApproval = 0
  let overdue = 0
  for (const section of book.sections) {
    for (const test of section.tests) {
      if (test.state === 'completed') completed++
      else if (test.state === 'pending_approval') pendingApproval++
      else if (test.state === 'overdue') overdue++
      else if (test.state === 'assigned' || test.state === 'returned') assigned++
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        backHref="/student"
        title={book.title}
        subtitle={[book.subject, book.publisher].filter(Boolean).join(' · ') || undefined}
        badges={book.examType ? <Badge variant="info">{book.examType}</Badge> : undefined}
      />

      <MetricTiles
        metrics={[
          {
            label: `Toplam ${unitLabel(book.trackingMode)}`,
            value: book.totalTests,
            icon: BookOpen,
          },
          { label: COUNTER_LABEL.completed, value: completed, tone: 'success', icon: CircleCheck },
          { label: 'Yapılacak', value: assigned, tone: 'warning', icon: UserRound },
          {
            label: COUNTER_LABEL.pendingApproval,
            value: pendingApproval,
            tone: 'info',
            icon: Hourglass,
          },
          { label: COUNTER_LABEL.overdue, value: overdue, tone: 'destructive', icon: CircleAlert },
          {
            label: 'Kalan',
            value: Math.max(0, book.totalTests - completed),
            icon: CircleDashed,
          },
        ]}
      />

      <StudentBookVideos book={book} watchRows={watchRows ?? []} />

      <TempoStrip
        startDate={scope.startDate}
        targetEndDate={scope.targetEndDate}
        totalUnits={scope.totalUnits}
        completedUnits={scope.completedUnits}
        trackingMode={book.trackingMode}
      />

      <ProgressSummary
        trackingMode={book.trackingMode}
        startDate={scope.startDate}
        targetEndDate={scope.targetEndDate}
        totalUnits={scope.totalUnits}
        completedUnits={scope.completedUnits}
        label={`${book.title} ilerlemesi`}
      />

      {/* Matris masaüstü içindir (R3 v2 "Mobil karar"): dar ekranda bölüm
          bazlı sade özet gösterilir. */}
      <div className="hidden lg:block">
        <BookMapGrid book={book} readOnly audience="student" />
      </div>

      <div className="lg:hidden">
        <Section
          title="Bölümler"
          description="Tam harita masaüstü ekranında görünür."
          variant="card"
        >
          <div className="space-y-3 p-4">
            <BookMapLegend audience="student" book={book} />
            <ul className="divide-y">
              {book.sections.map(section => (
                <li key={section.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate text-sm">{section.title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {section.completedCount} / {section.tests.length}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      </div>
    </div>
  )
}
