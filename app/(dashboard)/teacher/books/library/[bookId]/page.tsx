import { notFound } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { getTeacherContext, getLibraryWorkspaceId } from '@/lib/workspace'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/shared/page-header'
import { formatUnitCount } from '@/lib/unit-labels'

export const dynamic = 'force-dynamic'

// KÜTÜPHANE KAYNAĞI ÖNİZLEME (069).
//
// SALT OKUNUR. Koç kaynağı havuzuna almadan önce "içinde ne var?"
// sorusunu sorabilmeli — 60 bölümlük bir kaynağı adına bakıp seçmek kör
// bir karar olurdu. Düzenleme, öğrenciye atama ve ilerleme burada YOK:
// kütüphane kitabı koçun kitabı değildir, kopyası onun olur.
export default async function LibraryBookPreviewPage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId } = await params
  const { supabase } = await getTeacherContext()
  const libraryWorkspaceId = await getLibraryWorkspaceId()

  if (!libraryWorkspaceId) notFound()

  const { data: book } = await supabase
    .from('books')
    .select(`
      id, title, subject, publisher, exam_type, level_exam, edition_year,
      description, status, library_status, tracking_mode, resource_type,
      curriculum_program, structure_kind,
      book_sections(
        id, title, order_index, status, parent_section_id,
        book_tests(id, status)
      )
    `)
    .eq('id', bookId)
    .eq('workspace_id', libraryWorkspaceId)
    .maybeSingle()

  if (!book || book.status !== 'active' || book.library_status !== 'approved') notFound()

  const sections = (book.book_sections ?? [])
    .filter((s) => s.status === 'active')
    .sort((a, b) => a.order_index - b.order_index)

  const totalUnits = sections.reduce(
    (sum, s) => sum + (s.book_tests ?? []).filter((t) => t.status === 'active').length,
    0
  )

  const meta = [
    book.subject,
    book.level_exam || book.exam_type,
    book.resource_type && book.resource_type !== 'Belirtilmedi' ? book.resource_type : null,
    book.curriculum_program && book.curriculum_program !== 'Belirtilmedi'
      ? book.curriculum_program
      : null,
    book.edition_year != null ? String(book.edition_year) : null,
  ].filter(Boolean)

  return (
    <div className="mx-auto max-w-3xl p-6 md:p-8">
      <PageHeader
        title={book.title}
        subtitle={[book.publisher, meta.join(' · ')].filter(Boolean).join(' — ')}
        backHref="/teacher/books/library"
        badges={<Badge variant="neutral">Kütüphane</Badge>}
      />

      {book.description && (
        <p className="mb-6 text-sm text-muted-foreground">{book.description}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="size-4 text-muted-foreground" />
            {sections.filter((s) => !s.parent_section_id).length} bölüm ·{' '}
            {formatUnitCount(totalUnits, book.tracking_mode)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {sections.map((section) => {
              const unitCount = (section.book_tests ?? []).filter(
                (t) => t.status === 'active'
              ).length

              return (
                <li
                  key={section.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  {/* Alt bölüm girintili: kaynağın hiyerarşisi önizlemede de
                      görünmezse "60 satır" listesi anlamsız bir yığın olur. */}
                  <span className={section.parent_section_id ? 'pl-5 text-muted-foreground' : ''}>
                    {section.title}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatUnitCount(unitCount, book.tracking_mode)}
                  </span>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
