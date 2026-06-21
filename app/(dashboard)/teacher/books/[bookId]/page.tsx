import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BookOpen, Users } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export const dynamic = 'force-dynamic'

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId } = await params
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: book } = await supabase
    .from('books')
    .select(`
      id, title, subject, publisher, exam_type, description, status,
      book_sections(
        id, title, order_index, status,
        book_tests(id, title, order_index, status)
      )
    `)
    .eq('id', bookId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!book || book.status === 'archived') notFound()

  const { data: assignments } = await supabase
    .from('student_book_assignments')
    .select('id, student_id, students(full_name)')
    .eq('book_id', bookId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')

  const sections = (book.book_sections ?? []).sort((a, b) => a.order_index - b.order_index)
  const totalTests = sections.reduce((sum, s) => {
    const activeTests = (s.book_tests ?? []).filter((t) => t.status === 'active')
    return sum + activeTests.length
  }, 0)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/teacher/books">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{book.title}</h1>
            {book.exam_type && <Badge variant="secondary">{book.exam_type}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{book.subject}{book.publisher ? ` · ${book.publisher}` : ''}</p>
        </div>
      </div>

      {book.description && (
        <p className="text-sm text-muted-foreground mb-6">{book.description}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{sections.length}</p>
            <p className="text-xs text-muted-foreground">Bölüm</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{totalTests}</p>
            <p className="text-xs text-muted-foreground">Test</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{assignments?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Öğrenci</p>
          </CardContent>
        </Card>
      </div>

      {/* Sections */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="size-4" /> Bölümler
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Bölüm yok.</p>
          ) : (
            <div className="divide-y">
              {sections.map((section) => {
                const activeTests = (section.book_tests ?? []).filter(t => t.status === 'active')
                return (
                  <div key={section.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span>{section.title}</span>
                    <span className="text-muted-foreground text-xs">{activeTests.length} test</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assigned students */}
      {(assignments?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4" /> Atanmış Öğrenciler
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y">
              {assignments!.map((a) => {
                const student = a.students as unknown as { full_name: string }
                return (
                  <div key={a.id} className="py-2.5">
                    <Link href={`/teacher/students/${a.student_id}`} className="text-sm hover:underline">
                      {student.full_name}
                    </Link>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
