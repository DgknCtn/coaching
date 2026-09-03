import type { SupabaseClient } from '@supabase/supabase-js'

// "Aktif Tut" override'ları (041 §6.5).
//
// student_topic_overrides SATIRIN VARLIĞI bayrağın kendisidir: RPC
// set_topic_keep_active(true) satırı yazar, (false) satırı SİLER. Bu yüzden
// "aktif tutulan konular" = tablodaki topic_id kümesidir; ayrıca keep_active
// sütununa bakmak gerekmez ama savunma amaçlı süzülür (sütun NOT NULL
// DEFAULT TRUE olsa da tablo elle düzenlenebilir).
//
// Neden lib'de: Kitap Haritası satır menüsü bu bilgiyi öğretmen sayfasında
// gösterir, Koruma Havuzu ise aynı bayrağı kendi listesinde kullanır. İki
// kopya olsaydı "bu konu aktif tutuluyor mu?" sorusuna iki ekran farklı
// yanıt verebilirdi.
export async function loadKeepActiveTopicIds(
  supabase: SupabaseClient,
  { workspaceId, studentId }: { workspaceId: string; studentId: string }
): Promise<Set<string>> {
  const { data } = await supabase
    .from('student_topic_overrides')
    .select('topic_id')
    .eq('workspace_id', workspaceId)
    .eq('student_id', studentId)
    .eq('keep_active', true)

  return new Set(((data ?? []) as { topic_id: string }[]).map(r => r.topic_id))
}
