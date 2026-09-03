import type { SupabaseClient } from '@supabase/supabase-js'

// "Bu konuda açık çalışma var mı?" — TEK yanıt yeri.
//
// Kaynak `student_topic_open_work_view` (041): konuya bağlı, henüz
// kapanmamış ödev kalemlerini sayar.
//
// Neden lib'de: iki ekran aynı soruyu soruyor ve aynı yanıtı vermek zorunda.
//   - Koruma Havuzu: açık çalışması olan konu "Aktif Çalışma"dır ve havuzda
//     listelenmez (§6.5).
//   - Müfredat Akışı: aynı konu "İşleniyor" durumunda görünür.
// Sorgu kopyalansaydı bir ekran konuyu aktif sayarken diğeri saymayabilirdi.

/** Konu -> açık kalem sayısı. Yalnız satırı olan konular haritada bulunur. */
export async function loadOpenWorkByTopic(
  supabase: SupabaseClient,
  {
    workspaceId,
    studentId,
    topicIds,
  }: { workspaceId: string; studentId: string; topicIds?: string[] }
): Promise<Map<string, number>> {
  let query = supabase
    .from('student_topic_open_work_view')
    .select('topic_id, open_items')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)

  // Çağıran bir konu kümesiyle sınırlamak isteyebilir (havuz yalnız seçili
  // kapsamın konularına bakar). Boş dizi "hiçbiri" demektir, "hepsi" değil.
  if (topicIds) {
    if (topicIds.length === 0) return new Map()
    query = query.in('topic_id', topicIds)
  }

  const { data } = await query

  return new Map(
    ((data ?? []) as { topic_id: string; open_items: number }[]).map(r => [
      r.topic_id,
      Number(r.open_items ?? 0),
    ])
  )
}

/** Açık çalışması OLAN konuların kümesi — Müfredat Akışının ihtiyacı. */
export async function loadOpenWorkTopicIds(
  supabase: SupabaseClient,
  args: { workspaceId: string; studentId: string; topicIds?: string[] }
): Promise<Set<string>> {
  const byTopic = await loadOpenWorkByTopic(supabase, args)
  const out = new Set<string>()
  for (const [topicId, count] of byTopic) {
    if (count > 0) out.add(topicId)
  }
  return out
}
