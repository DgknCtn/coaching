import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { loadBookTopicOptions } from '@/lib/book-topic-options'
import { buildBulkRows } from '@/lib/topic-relevance'
import { BulkMapper } from './bulk-mapper'

// TOPLU KONU EŞLEME (Kitap Girişi ve Konu Eşleme 2c). Kitabın bütün
// (yaprak) bölümleri tek tabloda: solda bölüm, sağda önerilen konu.
// Öğretmen önerileri gözden geçirir ve tek kayıtla onaylar. Otomatik
// eşleme YOK — ön işaret yalnız eşlenmemiş bölümde, öğretmen kaldırabilir.

export const dynamic = 'force-dynamic'

export default async function BulkTopicMappingPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: book } = await supabase
    .from('books')
    .select(`
      id, title, subject, level_exam, status,
      book_sections(id, title, order_index, parent_section_id, book_section_topics(topic_id))
    `)
    .eq('id', bookId)
    .eq('workspace_id', workspaceId)
    .single()
  if (!book || book.status === 'archived') notFound()

  const { topics, filtered } = await loadBookTopicOptions(supabase, {
    workspaceId,
    subject: book.subject,
    levelExam: book.level_exam,
  })

  const sections = ((book.book_sections ?? []) as {
    id: string
    title: string
    order_index: number
    parent_section_id: string | null
    book_section_topics: { topic_id: string }[] | null
  }[]).map(s => ({
    id: s.id,
    title: s.title,
    orderIndex: s.order_index,
    parentId: s.parent_section_id,
    topicIds: (s.book_section_topics ?? []).map(t => t.topic_id),
  }))
  const rows = buildBulkRows(sections, topics)

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" render={<Link href={`/teacher/books/${bookId}/edit`} />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Konuları toplu eşle</h1>
          <p className="text-sm text-muted-foreground">{book.title}</p>
        </div>
      </div>
      <BulkMapper bookId={bookId} rows={rows} topics={topics} filtered={filtered} />
    </div>
  )
}
