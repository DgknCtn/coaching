import Link from 'next/link'
import { Plus, BookOpen, AlertCircle, Library } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { BookCard } from '@/components/shared/book-card'

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

  if (activeTerm) {
    booksQuery.eq('academic_term_id', activeTerm.id)
  }

  const { data: books } = await booksQuery

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Kitap Havuzu"
        subtitle={activeTerm?.name}
        action={
          activeTerm ? (
            <Link href="/teacher/books/new">
              <Button
                size="sm"
                className="gap-2 rounded-xl h-9 font-semibold shadow-sm"
                style={{ background: 'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))' }}
              >
                <Plus className="size-4" /> Yeni Kitap
              </Button>
            </Link>
          ) : (
            <Link href="/teacher/terms">
              <Button size="sm" variant="outline" className="gap-2 rounded-xl h-9 font-semibold">
                <AlertCircle className="size-4" /> Önce Dönem Oluştur
              </Button>
            </Link>
          )
        }
      />

      {!books?.length ? (
        <div className="bg-card rounded-2xl border shadow-xs">
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
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-5">
            <BookOpen className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground font-medium">
              {books.length} kitap
            </span>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
        </>
      )}
    </div>
  )
}
