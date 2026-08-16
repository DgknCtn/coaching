import Link from 'next/link'
import { Plus, AlertCircle, Library } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { BookCard } from '@/components/shared/book-card'
import { Section } from '@/components/shared/section'

export const dynamic = 'force-dynamic'

export default async function BooksPage() {
  const { supabase, workspaceId, activeTerm } = await getTeacherContext()

  const booksQuery = supabase
    .from('books')
    .select(`
      id, title, subject, publisher, exam_type, status,
      book_tests(count),
      book_sections(count)
    `)
    .eq('workspace_id', workspaceId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(500)

  if (activeTerm) {
    booksQuery.eq('academic_term_id', activeTerm.id)
  }

  const { data: books } = await booksQuery

  return (
    <div className="max-w-6xl space-y-8 p-6 md:p-8">
      <PageHeader
        title="Kitap Havuzu"
        subtitle={activeTerm?.name}
        action={
          activeTerm ? (
            <Button size="sm" render={<Link href="/teacher/books/new" />}>
              <Plus />
              Yeni Kitap
            </Button>
          ) : (
            <Button size="sm" variant="outline" render={<Link href="/teacher/terms" />}>
              <AlertCircle />
              Önce Dönem Oluştur
            </Button>
          )
        }
      />

      {!books?.length ? (
        <Section variant="card">
          <EmptyState
            icon={Library}
            title="Kitap havuzu boş"
            description={
              activeTerm
                ? 'Kitap havuzuna ilk kitabı ekleyerek başla.'
                : 'Kitap eklemek için önce aktif bir dönem oluşturmanız gerekiyor.'
            }
            action={activeTerm ? { label: 'İlk kitabı ekle', href: '/teacher/books/new' } : undefined}
          />
        </Section>
      ) : (
        <Section title={`${books.length} kitap`}>
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
                    sectionCount,
                    testCount,
                  }}
                  href={`/teacher/books/${book.id}`}
                />
              )
            })}
          </div>
        </Section>
      )}
    </div>
  )
}
