import type { SupabaseClient } from '@supabase/supabase-js'

// M1.0-06 — Müfredat Akışı ekranındaki "Kitap kapsamı" / "Son temas"
// sütunları.
//
// Konu özetinde farklı kaynakların sayfa/test adedi TEK PAYDAYA
// toplanmamalı (kabul kriteri): "1/4 kaynak tamamlandı" KAYNAK BAZLI
// olmalı. İki view'dan okur:
//   - student_topic_contact_view   (151): konu bazlı tek "son temas".
//   - student_topic_source_coverage_view (151, yeni): konu×kitap bazlı
//     "bu kaynaktaki testlerin tümü tamamlandı mı?" — çoklu eşleşmede her
//     eşlenen konu kendi kapsamını bağımsız görür (M1.0-06 ürün kararı).

export interface SourceCoverage {
  bookId: string
  bookTitle: string
  fullyCompleted: boolean
  hasContact: boolean
}

export interface TopicCoverage {
  lastContactDate: string | null
  sources: SourceCoverage[]
}

export async function loadTopicCoverage(
  supabase: SupabaseClient,
  { workspaceId, studentId, topicIds }: { workspaceId: string; studentId: string; topicIds: string[] }
): Promise<Map<string, TopicCoverage>> {
  const out = new Map<string, TopicCoverage>()
  if (topicIds.length === 0) return out

  const [{ data: contactRows }, { data: coverageRows }] = await Promise.all([
    supabase
      .from('student_topic_contact_view')
      .select('topic_id, last_contact_date')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .in('topic_id', topicIds),
    supabase
      .from('student_topic_source_coverage_view')
      .select('topic_id, book_id, fully_completed, has_contact')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .in('topic_id', topicIds),
  ])

  // Görünümler kitap başlığını taşımıyor (yalnız book_id) — PostgREST
  // view'lar için FK ilişkisi görmez, ayrı sorgu gerekiyor.
  const bookIds = [
    ...new Set(((coverageRows ?? []) as { book_id: string }[]).map(r => r.book_id)),
  ]
  const { data: bookRows } = bookIds.length
    ? await supabase.from('books').select('id, title').in('id', bookIds)
    : { data: [] }
  const titleByBook = new Map(
    ((bookRows ?? []) as { id: string; title: string }[]).map(b => [b.id, b.title])
  )

  const lastContactByTopic = new Map(
    ((contactRows ?? []) as { topic_id: string; last_contact_date: string }[]).map(r => [
      r.topic_id,
      r.last_contact_date,
    ])
  )

  const sourcesByTopic = new Map<string, SourceCoverage[]>()
  for (const row of (coverageRows ?? []) as {
    topic_id: string
    book_id: string
    fully_completed: boolean
    has_contact: boolean
  }[]) {
    const list = sourcesByTopic.get(row.topic_id) ?? []
    list.push({
      bookId: row.book_id,
      bookTitle: titleByBook.get(row.book_id) ?? 'Kitap',
      fullyCompleted: row.fully_completed,
      hasContact: row.has_contact,
    })
    sourcesByTopic.set(row.topic_id, list)
  }

  for (const topicId of topicIds) {
    out.set(topicId, {
      lastContactDate: lastContactByTopic.get(topicId) ?? null,
      sources: sourcesByTopic.get(topicId) ?? [],
    })
  }

  return out
}

/**
 * PDF formatı: tek kaynak tamamlandıysa "{kitap} ✓", tek kaynakta yalnız
 * temas varsa "{kitap}: temas var", çoklu kaynakta "{N}/{M} kaynak
 * tamamlandı", hiç kaynak yoksa "-".
 */
export function formatBookCoverage(sources: SourceCoverage[]): string {
  if (sources.length === 0) return '-'

  if (sources.length === 1) {
    const [s] = sources
    if (s.fullyCompleted) return `${s.bookTitle} ✓`
    if (s.hasContact) return `${s.bookTitle}: temas var`
    return '-'
  }

  const completed = sources.filter(s => s.fullyCompleted).length
  return `${completed}/${sources.length} kaynak tamamlandı`
}
