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
      curriculum_program, resource_type, structure_kind,
      description, status, tracking_mode, video_mode, video_url,
      book_parts(id, title, order_index),
      book_sections(
        id, title, order_index, group_label, theme_label, topic_id,
        part_id, page_start, page_end,
        book_tests(id),
        book_section_topics(topic_id)
      )
    `)
    .eq('id', bookId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!book || book.status === 'archived') notFound()

  // R7-02 §6.5: yapısal düzenlemenin (takip türü, sayfa aralığı) tek kilit
  // ölçütü kaynakta ilerleme olup olmadığıdır. Ölçüt DB'de book_has_progress
  // içinde; burada yalnız formun neyi kilitleyeceğini bilmek için okunur.
  const { data: hasProgress } = await supabase.rpc('book_has_progress', {
    p_book_id: bookId,
  })

  // R7-02 §8: müfredat listesi kitabın Ders + Seviye/Sınav bilgisine göre
  // FİLTRELENİR. Kabul #8: "TYT Matematik müfredat seçiminde AYT Felsefe
  // görünmüyor." Filtre kapsam (academic_scopes) düzeyinde uygulanır; kapsam
  // zaten subject/level_exam taşıyor (038).
  //
  // Kapsamın alanı BOŞSA dışarıda bırakılmaz: eski kapsamlarda bu alanlar
  // doldurulmamış olabilir ve onları gizlemek eşlemeyi imkânsız kılardı.
  let scopeQuery = supabase
    .from('academic_scopes')
    .select('id, name, subject, level_exam')
    .eq('workspace_id', workspaceId)
    .eq('active', true)

  if (book.subject) {
    scopeQuery = scopeQuery.or(`subject.is.null,subject.eq.${book.subject}`)
  }
  if (book.level_exam) {
    scopeQuery = scopeQuery.or(`level_exam.is.null,level_exam.eq.${book.level_exam}`)
  }

  const { data: scopeRows } = await scopeQuery
  let scopes = scopeRows ?? []

  // KAÇIŞ YOLU: filtre hiçbir kapsamla eşleşmezse eşleştirme imkânsız hale
  // gelirdi. R7-02 §8 listeyi DARALTMAK istiyor, eşlemeyi engellemek değil
  // (R6-15'in "filtre atamayı kısıtlamaz" ilkesiyle aynı mantık). Bu durumda
  // workspace'in tüm aktif kapsamlarına düşülür ve kullanıcıya söylenir.
  const filtered = scopes.length > 0
  if (!filtered) {
    const { data: allScopes } = await supabase
      .from('academic_scopes')
      .select('id, name, subject, level_exam')
      .eq('workspace_id', workspaceId)
      .eq('active', true)
    scopes = allScopes ?? []
  }

  const scopeIds = scopes.map((s) => s.id)
  const scopeNameById = new Map(scopes.map((s) => [s.id, s.name]))

  const { data: topicRows } = scopeIds.length
    ? await supabase
        .from('topics')
        .select('id, name, scope_id')
        .eq('workspace_id', workspaceId)
        .eq('active', true)
        .in('scope_id', scopeIds)
        .order('sort_order')
        .order('name')
    : { data: [] }

  const topics: TopicOption[] = (topicRows ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    scopeName: scopeNameById.get(t.scope_id) ?? 'Kapsam',
  }))

  const parts = (book.book_parts ?? [])
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .map((p) => ({ id: p.id, title: p.title }))

  const sections = (book.book_sections ?? [])
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .map((s) => ({
      id: s.id,
      title: s.title,
      testCount: (s.book_tests ?? []).length,
      // R6-17 etiketleri artık düzenlenmiyor; yalnız eski kayıtlarda
      // Parça'ya taşınabilsin diye okunur ipucu olarak gösteriliyor.
      groupLabel: s.group_label ?? null,
      themeLabel: s.theme_label ?? null,
      partId: s.part_id ?? null,
      pageStart: s.page_start ?? null,
      pageEnd: s.page_end ?? null,
      topicIds: (s.book_section_topics ?? []).map((t) => t.topic_id),
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
          resourceType: book.resource_type ?? 'Belirtilmedi',
          structureKind: (book.structure_kind ?? 'single') as 'single' | 'multi',
          description: book.description ?? '',
          videoMode: book.video_mode ?? 'none',
          videoUrl: book.video_url ?? '',
        }}
        sections={sections}
        parts={parts}
        topics={topics}
        topicsFiltered={filtered}
        trackingMode={book.tracking_mode ?? 'test'}
        hasProgress={hasProgress === true}
      />
    </div>
  )
}
