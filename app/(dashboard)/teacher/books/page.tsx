import Link from 'next/link'
import { Plus, BookOpen, AlertCircle } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Kitap Havuzu</h1>
          {activeTerm && <p className="text-sm text-muted-foreground">{activeTerm.name}</p>}
        </div>
        {activeTerm ? (
          <Link href="/teacher/books/new">
            <Button size="sm">
              <Plus className="size-4" /> Yeni Kitap
            </Button>
          </Link>
        ) : (
          <Link href="/teacher/terms">
            <Button size="sm" variant="outline">
              <AlertCircle className="size-4" /> Önce Dönem Oluştur
            </Button>
          </Link>
        )}
      </div>

      {!books?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="size-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">Henüz kitap yok.</p>
          {activeTerm && (
            <Link href="/teacher/books/new" className="mt-4">
              <Button variant="outline">İlk kitabı ekle</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => {
            const testCount = (book.book_tests as unknown as { count: number }[])?.[0]?.count ?? 0
            const sectionCount = (book.book_sections as unknown as { count: number }[])?.[0]?.count ?? 0
            return (
              <Link key={book.id} href={`/teacher/books/${book.id}`}>
                <Card className="hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer h-full">
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="font-medium text-sm leading-snug">{book.title}</h3>
                      {book.exam_type && (
                        <Badge variant="secondary" className="shrink-0 text-xs">{book.exam_type}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">{book.subject}</p>
                    {book.publisher && <p className="text-xs text-muted-foreground">{book.publisher}</p>}
                    <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
                      <span>{sectionCount} bölüm</span>
                      <span>·</span>
                      <span>{testCount} test</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
