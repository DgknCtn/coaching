import Link from 'next/link'
import { ArrowLeft, Library } from 'lucide-react'
import { getTeacherContext, getLibraryWorkspaceId } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Section } from '@/components/shared/section'
import { BookPoolFilters } from '../book-pool-filters'
import { LibraryPicker, type LibraryBook } from './library-picker'

export const dynamic = 'force-dynamic'

// KAYNAK KÜTÜPHANESİ (069).
//
// Yeni koçun havuzu boş açılıyor ve tek çıkış yolu her kaynağı elle
// girmekti. Burası o kaynakların bir kez düzgün kurulmuş hâlinin ortak
// listesi: koç filtreyle bulur, çoklu seçer, kendi havuzuna KOPYALAR.
//
// Sorgu ve facet türetme, komşu ../page.tsx (Kitap Havuzu) ile bilinçli
// olarak AYNI desende: aynı filtre çubuğu, aynı searchParams anahtarları,
// aynı sunucu tarafı filtreleme. Tek fark hangi çalışma alanına bakıldığı.
interface PageProps {
  searchParams: Promise<{
    q?: string
    subject?: string
    level?: string
    publisher?: string
    year?: string
    tracking?: string
    program?: string
    type?: string
  }>
}

export default async function LibraryPage({ searchParams }: PageProps) {
  const { supabase, workspaceId } = await getTeacherContext()
  const libraryWorkspaceId = await getLibraryWorkspaceId()
  const filters = await searchParams

  const header = (
    <PageHeader
      title="Kaynak Kütüphanesi"
      subtitle="Hazır kurulmuş kaynakları seçip kendi havuzuna ekle"
      action={
        <Button size="sm" variant="outline" render={<Link href="/teacher/books" />}>
          <ArrowLeft />
          Havuza dön
        </Button>
      }
    />
  )

  // Kütüphane alanı henüz açılmamış olabilir (platform yöneticisi kurar).
  // Bu bir hata değil, bir DURUM: sayfa çökmez, ne olduğunu söyler.
  if (!libraryWorkspaceId) {
    return (
      <div className="max-w-6xl space-y-6 p-6 md:p-8">
        {header}
        <Section variant="card">
          <EmptyState
            icon={Library}
            title="Kütüphane henüz hazır değil"
            description="Ortak kaynak kütüphanesi hazırlanıyor. Bu arada kendi kitaplarını havuza elle ekleyebilirsin."
            action={{ label: 'Yeni kitap ekle', href: '/teacher/books/new' }}
          />
        </Section>
      </div>
    )
  }

  let query = supabase
    .from('books')
    .select(`
      id, title, subject, publisher, exam_type, level_exam, edition_year,
      tracking_mode, curriculum_program, resource_type, structure_kind,
      book_tests(count),
      book_sections(count)
    `)
    .eq('workspace_id', libraryWorkspaceId)
    .eq('status', 'active')
    .eq('library_status', 'approved')
    .order('title', { ascending: true })
    .limit(500)

  if (filters.q) {
    const term = filters.q.replace(/[%,()]/g, ' ').trim()
    if (term) query = query.or(`title.ilike.%${term}%,publisher.ilike.%${term}%`)
  }
  if (filters.subject) query = query.eq('subject', filters.subject)
  if (filters.level) query = query.eq('level_exam', filters.level)
  if (filters.publisher) query = query.eq('publisher', filters.publisher)
  if (filters.tracking) query = query.eq('tracking_mode', filters.tracking)
  if (filters.program) query = query.eq('curriculum_program', filters.program)
  if (filters.type) query = query.eq('resource_type', filters.type)
  if (filters.year && /^\d{4}$/.test(filters.year)) {
    query = query.eq('edition_year', Number(filters.year))
  }

  // Koçun havuzunda hangi kütüphane kitapları zaten var? Arşivlenmiş kopya
  // sayılmaz: koç kitabı bilerek havuzdan çıkardıysa tekrar ekleyebilmeli.
  const [{ data: books }, { data: facetRows }, { data: owned }] = await Promise.all([
    query,
    supabase
      .from('books')
      .select('publisher, edition_year')
      .eq('workspace_id', libraryWorkspaceId)
      .eq('status', 'active')
      .eq('library_status', 'approved')
      .limit(1000),
    supabase
      .from('books')
      .select('library_source_book_id')
      .eq('workspace_id', workspaceId)
      .neq('status', 'archived')
      .not('library_source_book_id', 'is', null)
      .limit(2000),
  ])

  const ownedSourceIds = new Set(
    (owned ?? [])
      .map((b) => b.library_source_book_id)
      .filter((id): id is string => !!id)
  )

  const publishers = Array.from(
    new Set((facetRows ?? []).map((r) => r.publisher).filter((p): p is string => !!p))
  ).sort((a, b) => a.localeCompare(b, 'tr'))

  const editionYears = Array.from(
    new Set((facetRows ?? []).map((r) => r.edition_year).filter((y): y is number => y != null))
  ).sort((a, b) => b - a)

  const rows: LibraryBook[] = ((books ?? []) as unknown as Array<{
    id: string
    title: string
    subject: string
    publisher: string | null
    exam_type: string | null
    level_exam: string | null
    edition_year: number | null
    curriculum_program: string | null
    resource_type: string | null
    structure_kind: string | null
    tracking_mode: string | null
    book_tests: { count: number }[]
    book_sections: { count: number }[]
  }>).map((b) => ({
    id: b.id,
    title: b.title,
    subject: b.subject,
    publisher: b.publisher,
    exam_type: b.exam_type,
    level_exam: b.level_exam,
    edition_year: b.edition_year,
    curriculum_program: b.curriculum_program,
    resource_type: b.resource_type,
    structure_kind: b.structure_kind,
    tracking_mode: b.tracking_mode,
    sectionCount: b.book_sections?.[0]?.count ?? 0,
    testCount: b.book_tests?.[0]?.count ?? 0,
    alreadyOwned: ownedSourceIds.has(b.id),
  }))

  const libraryIsEmpty = (facetRows?.length ?? 0) === 0

  return (
    <div className="max-w-6xl space-y-6 p-6 md:p-8">
      {header}

      {libraryIsEmpty ? (
        <Section variant="card">
          <EmptyState
            icon={Library}
            title="Kütüphanede henüz kaynak yok"
            description="Ortak kütüphane doldurulduğunda kaynaklar burada listelenecek."
            action={{ label: 'Yeni kitap ekle', href: '/teacher/books/new' }}
          />
        </Section>
      ) : (
        <>
          <BookPoolFilters
            publishers={publishers}
            editionYears={editionYears}
            resultCount={rows.length}
            searchPlaceholder="Kütüphanede kitap adı veya yayın ara"
            resultNoun="kaynak"
          />

          {rows.length === 0 ? (
            <Section variant="card">
              <EmptyState
                icon={Library}
                title="Filtreye uyan kaynak yok"
                description="Filtreleri temizleyip tekrar dene."
              />
            </Section>
          ) : (
            <LibraryPicker books={rows} />
          )}
        </>
      )}
    </div>
  )
}
