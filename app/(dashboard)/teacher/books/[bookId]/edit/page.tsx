import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { BookEditForm, type TopicOption } from './book-edit-form'

export const dynamic = 'force-dynamic'

export default async function BookEditPage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId } = await params
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: book } = await supabase
    .from('books')
    .select(`
      id, title, subject, publisher, exam_type, level_exam, edition_year,
      curriculum_program,
      description, status, tracking_mode, video_mode, video_url,
      book_sections(
        id, title, order_index, group_label, theme_label, topic_id,
        book_tests(id)
      )
    `)
    .eq('id', bookId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!book || book.status === 'archived') notFound()

  // R5.3: eşlenebilecek müfredat konuları, kapsam adıyla birlikte.
  // Hiç konu tanımlı değilse seçici hiç gösterilmez ve kitap düzenleme
  // ekranı bugünkü hâliyle kalır.
  const { data: topicRows } = await supabase
    .from('topics')
    .select('id, name, academic_scopes(name)')
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .order('name')

  const topics: TopicOption[] = (
    (topicRows ?? []) as unknown as {
      id: string
      name: string
      academic_scopes: { name: string } | { name: string }[] | null
    }[]
  ).map((t) => ({
    id: t.id,
    name: t.name,
    scopeName:
      (Array.isArray(t.academic_scopes) ? t.academic_scopes[0] : t.academic_scopes)?.name ??
      'Kapsam',
  }))

  const sections = (book.book_sections ?? [])
    .sort((a, b) => a.order_index - b.order_index)
    .map((s) => ({
      id: s.id,
      title: s.title,
      testCount: (s.book_tests ?? []).length,
      groupLabel: s.group_label ?? null,
      themeLabel: s.theme_label ?? null,
      topicId: s.topic_id ?? null,
    }))

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" render={<Link href={`/teacher/books/${bookId}`} />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Kitabı Düzenle</h1>
          <p className="text-sm text-muted-foreground">{book.title}</p>
        </div>
      </div>

      <BookEditForm
        bookId={book.id}
        defaultValues={{
          title: book.title,
          subject: book.subject,
          publisher: book.publisher ?? '',
          levelExam: book.level_exam ?? '',
          curriculumProgram: book.curriculum_program ?? 'Belirtilmedi',
          editionYear: book.edition_year ?? undefined,
          description: book.description ?? '',
          videoMode: (book.video_mode ?? 'none') as 'none' | 'book' | 'section',
          videoUrl: book.video_url ?? '',
        }}
        sections={sections}
        topics={topics}
        trackingMode={book.tracking_mode ?? 'test'}
      />
    </div>
  )
}
