import { notFound } from 'next/navigation'
import { getParentContext } from '@/lib/workspace'
import { loadBookMap } from '@/lib/book-map'
import { resolvePlanScope } from '@/lib/plan-scope'
import { collectVideoResources, watchedKeys } from '@/lib/book-videos'
import { BookVideoPanel } from '@/components/shared/book-video-panel'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { ParentTempoRow } from '@/components/shared/parent-tempo-row'
import { BookMapGrid, BookMapLegend } from '@/components/shared/book-map-grid'

export const dynamic = 'force-dynamic'

/**
 * Veli için kitap haritası — SALT OKUNUR ve ÖZET ODAKLI.
 *
 * R3 v2 §4: veliye operasyonel sayaçların tamamı taşınmaz; başlangıç-hedef,
 * kapsam, planlanan/gerekli tempo ve nötr plan konumu daha değerlidir.
 * Harita "kitabın dolduğu" hissini vermek için eklenir, ödev yönetimi için
 * değil. RLS zaten veliye yalnız bağlı öğrencisinin kayıtlarını gösteriyor
 * (is_parent_of_student).
 */
export default async function ParentBookMapPage({
  params,
}: {
  params: Promise<{ studentId: string; bookId: string }>
}) {
  const { studentId, bookId } = await params
  const { supabase, workspaceId, linkedStudents } = await getParentContext()

  // Veli yalnız kendi bağlı öğrencisinin sayfasını açabilir.
  const link = linkedStudents.find(l => l.students.id === studentId)
  if (!link) notFound()

  const [book] = await loadBookMap(supabase, {
    workspaceId,
    studentId,
    bookIds: [bookId],
  })

  if (!book) notFound()

  // Öğrencinin "izledim" işaretleri — veli bunları okuyabilir (023).
  const { data: watchRows } = await supabase
    .from('video_watch_marks')
    .select('section_id')
    .eq('student_book_assignment_id', book.assignmentId)

  // Öğretmenin hedef kapsamı neyse veli de onu görür.
  const scope = resolvePlanScope(book)

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        backHref="/parent"
        title={book.title}
        subtitle={
          [link.students.full_name, book.subject, book.publisher].filter(Boolean).join(' · ') ||
          undefined
        }
        badges={book.examType ? <Badge variant="info">{book.examType}</Badge> : undefined}
      />

      {/* Veliye sadeleştirilmiş tempo (R6 bekleme listesi): aynı hesap,
          tek cümlelik anlatım. */}
      <ParentTempoRow
        bookTitle={book.title}
        startDate={scope.startDate}
        targetEndDate={scope.targetEndDate}
        totalUnits={scope.totalUnits}
        completedUnits={scope.completedUnits}
        trackingMode={book.trackingMode}
      />

      {/* Video kaynakları veliye SALT OKUNUR gösterilir: işaretleme öğrenciye
          ait bir aksiyondur ve plan temposuna girmez (R4 §6). Önceden izlenme
          kümesi boş geçiliyordu, yani liste durumsuz ve yararsızdı; veli
          zaten video_watch_marks üzerinde SELECT hakkına sahip (023). */}
      <BookVideoPanel
        book={book}
        resources={collectVideoResources(book, watchedKeys(watchRows ?? []))}
      />

      {/* Matris masaüstü içindir; dar ekranda bölüm bazlı özet kalır. */}
      <div className="hidden lg:block">
        <BookMapGrid book={book} readOnly audience="parent" />
      </div>

      <div className="lg:hidden">
        <Section
          title="Bölümler"
          description="Tam harita masaüstü ekranında görünür."
          variant="card"
        >
          <div className="space-y-3 p-4">
            <BookMapLegend audience="parent" book={book} />
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
