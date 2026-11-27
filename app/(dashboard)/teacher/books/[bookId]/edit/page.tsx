import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { BookEditForm } from './book-edit-form'
import { loadBookTopicOptions } from '@/lib/book-topic-options'
import { fetchAllRows } from '@/lib/fetch-all'

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
    // 076: alt bölümlere ayırma yıkıcı bir işlem — bölümün testleri
    // silinip yerine alt bölüm kurulur. Arayüzün düğmeyi kapatabilmesi
    // için hangi testlerin ödevde/tamamlamada kullanıldığı gerekiyor;
    // book_tests altındaki iki gömme bunun için.
    .select(`
      id, title, subject, publisher, exam_type, level_exam, edition_year,
      curriculum_program, resource_type, structure_kind,
      description, status, tracking_mode, video_mode, video_url,
      book_parts(id, title, order_index),
      book_sections(
        id, title, order_index, group_label, theme_label, topic_id,
        part_id, page_start, page_end, parent_section_id, test_start, test_end,
        book_tests(id, homework_items(id), test_completions(id)),
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

  // Revize Mini 03: sayfa aralığı kilidi artık KİTAP değil BÖLÜM düzeyinde
  // ve tam kilit değil uyarı. Hangi bölümün hangi sayfalarında ödev ya da
  // tamamlama kaydı (geri alınmış dahil) olduğu okunur.
  const [usedByHomework, usedByCompletion] = await Promise.all([
    fetchAllRows<{ book_tests: { section_id: string; order_index: number } | { section_id: string; order_index: number }[] | null }>((from, to) =>
      supabase
        .from('homework_items')
        .select('book_tests!inner(section_id, order_index, book_id)')
        .eq('book_tests.book_id', bookId)
        .order('id')
        .range(from, to)
    ),
    fetchAllRows<{ book_tests: { section_id: string; order_index: number } | { section_id: string; order_index: number }[] | null }>((from, to) =>
      supabase
        .from('test_completions')
        .select('book_tests!inner(section_id, order_index, book_id)')
        .eq('book_tests.book_id', bookId)
        .order('id')
        .range(from, to)
    ),
  ])
  const usedPagesBySection: Record<string, number[]> = {}
  for (const row of [...usedByHomework.data, ...usedByCompletion.data]) {
    const bt = Array.isArray(row.book_tests) ? row.book_tests[0] : row.book_tests
    if (!bt) continue
    const list = (usedPagesBySection[bt.section_id] ??= [])
    if (!list.includes(bt.order_index)) list.push(bt.order_index)
  }

  // Kapsam kademesi + konu listesi (2a) — toplu eşleme ekranıyla ortak.
  const { topics, filtered } = await loadBookTopicOptions(supabase, {
    workspaceId,
    subject: book.subject,
    levelExam: book.level_exam,
  })

  const parts = (book.book_parts ?? [])
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .map((p) => ({ id: p.id, title: p.title }))

  // R7-03: alt bölümler ayrı bir liste değil, ait oldukları bölümün
  // altında taşınır. Böylece düzenleme arayüzü ağacı olduğu gibi görür
  // (haritanın aksine — orası yaprak listesi ister).
  const allSectionRows = (book.book_sections ?? [])
    .slice()
    .sort((a, b) => a.order_index - b.order_index)

  const subsectionsByParent = new Map<string, typeof allSectionRows>()
  for (const row of allSectionRows) {
    if (!row.parent_section_id) continue
    const list = subsectionsByParent.get(row.parent_section_id) ?? []
    list.push(row)
    subsectionsByParent.set(row.parent_section_id, list)
  }

  const sections = allSectionRows
    .filter((s) => !s.parent_section_id)
    .map((s) => ({
      id: s.id,
      title: s.title,
      testCount: (s.book_tests ?? []).length,
      // Kullanılmış test = ödevde verilmiş VEYA tamamlanmış. İkisi de
      // sayılır: tamamlanmış bir testi silmek öğrencinin yaptığı işi,
      // ödevdekini silmek verilmiş bir görevi yok ederdi.
      usedTestCount: (s.book_tests ?? []).filter(
        (t) =>
          ((t as { homework_items?: unknown[] }).homework_items ?? []).length > 0 ||
          ((t as { test_completions?: unknown[] }).test_completions ?? []).length > 0
      ).length,
      subsections: (subsectionsByParent.get(s.id) ?? []).map((sub) => ({
        id: sub.id,
        title: sub.title,
        testStart: sub.test_start ?? null,
        testEnd: sub.test_end ?? null,
        testCount: (sub.book_tests ?? []).length,
        // M1.0-06: Alt Bölüm'de de müfredat eşlemesi yapılabilsin diye
        // (üst Bölüm eşlemesi, testler alt bölümdeyse hiç işe yaramıyordu
        // — book_tests.section_id her zaman yaprağı gösterir, 047).
        // Veri zaten üstteki book_sections sorgusunda embed geliyor,
        // yalnız buraya kadar taşınmıyordu.
        topicIds: (sub.book_section_topics ?? []).map((t) => t.topic_id),
      })),
      // R6-17 etiketleri artık düzenlenmiyor; yalnız eski kayıtlarda
      // Parça'ya taşınabilsin diye okunur ipucu olarak gösteriliyor.
      groupLabel: s.group_label ?? null,
      themeLabel: s.theme_label ?? null,
      partId: s.part_id ?? null,
      pageStart: s.page_start ?? null,
      pageEnd: s.page_end ?? null,
      // R7-03 Revize: sayfa kitabında bilgi amaçlı test aralığı.
      testStart: s.test_start ?? null,
      testEnd: s.test_end ?? null,
      topicIds: (s.book_section_topics ?? []).map((t) => t.topic_id),
    }))

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" render={<Link href={`/teacher/books/${bookId}`} />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Kitabı Düzenle</h1>
          <p className="text-sm text-muted-foreground">{book.title}</p>
        </div>
        {/* 2c: bütün bölümler tek tabloda, önerilerle. */}
        <Button variant="outline" size="sm" render={<Link href={`/teacher/books/${bookId}/eslestir`} />}>
          Konuları toplu eşle
        </Button>
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
        usedPagesBySection={usedPagesBySection}
      />
    </div>
  )
}
