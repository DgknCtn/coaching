import Link from 'next/link'
import { Plus, Library, Download } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { BookCard } from '@/components/shared/book-card'
import { Section } from '@/components/shared/section'
import { BookPoolFilters } from './book-pool-filters'

export const dynamic = 'force-dynamic'

// Kitap Havuzu (R4 §2).
//
// 021 ile havuz dönemden ayrıldı: liste artık aktif döneme göre kısıtlanmaz,
// çünkü 100+ kitaplık havuz bir kez emek verilerek kurulan kalıcı bir
// kütüphanedir. Dönem bağı yalnızca öğrenciye atama anında anlamlıdır.
//
// Filtreleme sunucu tarafında yapılır; istemciye yalnızca eşleşen kitaplar
// iner. Filtre durumu URL'dedir (bkz. BookPoolFilters).
interface PageProps {
  searchParams: Promise<{
    q?: string
    subject?: string
    level?: string
    publisher?: string
    year?: string
    tracking?: string
    program?: string
    /** R7-02 §6.2: Kaynak Türü filtresi. */
    type?: string
  }>
}

export default async function BooksPage({ searchParams }: PageProps) {
  const { supabase, workspaceId } = await getTeacherContext()
  const filters = await searchParams

  let query = supabase
    .from('books')
    .select(`
      id, title, subject, publisher, exam_type, level_exam, edition_year,
      tracking_mode, curriculum_program, resource_type, structure_kind, status,
      book_tests(count),
      book_sections(count)
    `)
    .eq('workspace_id', workspaceId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(500)

  if (filters.q) {
    // Kitap adı veya yayın adında geçen kaynaklar.
    const term = filters.q.replace(/[%,()]/g, ' ').trim()
    if (term) query = query.or(`title.ilike.%${term}%,publisher.ilike.%${term}%`)
  }
  if (filters.subject) query = query.eq('subject', filters.subject)
  if (filters.level) query = query.eq('level_exam', filters.level)
  if (filters.publisher) query = query.eq('publisher', filters.publisher)
  if (filters.tracking) query = query.eq('tracking_mode', filters.tracking)
  // R6-14: öğretim programı. level_exam ile BAĞIMSIZ bir filtredir; TYT
  // seçmek 1. Aşama kaynaklarını getirmez çünkü ikisi ayrı değerlerdir.
  if (filters.program) query = query.eq('curriculum_program', filters.program)
  // R7-02 §6.2: tür yalnız bir sınıflamadır; kaynağın kaç tanesinin aynı
  // türde olduğu önemsizdir, filtre bunu kısıtlamaz.
  if (filters.type) query = query.eq('resource_type', filters.type)
  if (filters.year && /^\d{4}$/.test(filters.year)) {
    query = query.eq('edition_year', Number(filters.year))
  }

  const { data: books } = await query

  // Filtre seçenekleri havuzun gerçek içeriğinden türetilir; kullanıcıya
  // hiç kitabı olmayan bir yayın/yıl gösterilmez.
  const { data: facetRows } = await supabase
    .from('books')
    .select('publisher, edition_year')
    .eq('workspace_id', workspaceId)
    .neq('status', 'archived')
    .limit(1000)

  const publishers = Array.from(
    new Set((facetRows ?? []).map((r) => r.publisher).filter((p): p is string => !!p))
  ).sort((a, b) => a.localeCompare(b, 'tr'))

  const editionYears = Array.from(
    new Set((facetRows ?? []).map((r) => r.edition_year).filter((y): y is number => y != null))
  ).sort((a, b) => b - a)

  const hasAnyBook = (facetRows?.length ?? 0) > 0

  return (
    <div className="max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Kitap Havuzu"
        subtitle="Tüm dönemlerde kullanılabilen kalıcı kaynak kütüphanesi"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" render={<a href="/teacher/books/export?format=json" />}>
              <Download />
              Yedek al
            </Button>
            <Button size="sm" render={<Link href="/teacher/books/new" />}>
              <Plus />
              Yeni Kitap
            </Button>
          </div>
        }
      />

      {!hasAnyBook ? (
        <Section variant="card">
          <EmptyState
            icon={Library}
            title="Kitap havuzu boş"
            description="Kitap havuzuna ilk kitabı ekleyerek başla."
            action={{ label: 'İlk kitabı ekle', href: '/teacher/books/new' }}
          />
        </Section>
      ) : (
        <>
          <BookPoolFilters
            publishers={publishers}
            editionYears={editionYears}
            resultCount={books?.length ?? 0}
          />

          {!books?.length ? (
            <Section variant="card">
              <EmptyState
                icon={Library}
                title="Eşleşen kitap yok"
                description="Arama veya filtreleri değiştirerek tekrar deneyin."
              />
            </Section>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {books.map((book) => {
                const testCount = (book.book_tests as unknown as { count: number }[])?.[0]?.count ?? 0
                const sectionCount = (book.book_sections as unknown as { count: number }[])?.[0]?.count ?? 0
                return (
                  <BookCard
                    key={book.id}
                    book={{
                      id: book.id,
                      title: book.title,
                      subject: book.subject,
                      publisher: book.publisher,
                      exam_type: book.exam_type,
                      level_exam: book.level_exam,
                      edition_year: book.edition_year,
                      sectionCount,
                      testCount,
                      tracking_mode: book.tracking_mode,
                      curriculum_program: book.curriculum_program,
                      resource_type: book.resource_type,
                      structure_kind: book.structure_kind,
                    }}
                    href={`/teacher/books/${book.id}`}
                  />
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
