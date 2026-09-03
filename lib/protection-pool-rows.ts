import type { SupabaseClient } from '@supabase/supabase-js'
import { loadOpenWorkByTopic } from '@/lib/open-work'
import type { PoolRowInput } from '@/lib/protection-pool'

// Koruma havuzu satırlarının TEK kurulum yeri.
//
// Bu blok önce yalnız öğretmenin havuz sayfasında duruyordu. Öğrencinin
// "Tekrar edilecek konular" ekranı aynı satırları kurmak zorunda; kopya
// çıkarılsaydı iki ekran farklı havuz gösterebilirdi — ve fark tam da
// gözden kaçacak yerde olurdu, çünkü ikisi de "aynı" görünüyor.
// lib/open-work.ts ve lib/assignable-books.ts ile aynı gerekçe.
//
// SCOPE KAYNAĞI (§6.1): havuz kendi sabit ders listesini TUTMAZ.
// Öğrencinin dersleri müfredat akışından gelir — akış atanmış her scope
// bir sekmedir.
//
// İZLENEN KONULAR: yalnız öğrencinin AKTİF müfredat akışındaki konular.
// Akıştan çıkarılan konu havuzda görünmez ama temas kaydı veritabanında
// durur (KH-17) — geçmiş silinmez, yalnız radar kapsamı daralır.

/** Supabase iç içe select'i tek kaydı da dizi tipinde çözebiliyor. */
type Nested<T> = T | T[] | null
function one<T>(value: Nested<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export interface PoolScope {
  id: string
  name: string
}

export interface PoolData {
  /** Akışı olan dersler — sekme şeridi. */
  scopes: PoolScope[]
  /** Geçerli (ya da varsayılan) ders. Akış hiç yoksa null. */
  activeScopeId: string | null
  /** Seçili dersin havuz satırları; buildProtectionPool'un girdisi. */
  rows: PoolRowInput[]
  /** Konunun çalışıldığı kitaplar — "kaynağa git" bağlantısı için. */
  bookIdsByTopic: Map<string, string[]>
}

/**
 * Havuz verisini kurar.
 *
 * `requestedScopeId` geçersizse sessizce ilk derse düşülür: kullanıcı
 * yanlış bir bağlantıyla boş ekran görmemeli.
 */
export async function loadProtectionPoolData(
  supabase: SupabaseClient,
  {
    workspaceId,
    studentId,
    requestedScopeId,
  }: { workspaceId: string; studentId: string; requestedScopeId?: string }
): Promise<PoolData> {
  const { data: flowRows } = await supabase
    .from('student_curriculum_items')
    .select('topic_id, scope_id, topics(name), academic_scopes(name)')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)

  type FlowRow = {
    topic_id: string
    scope_id: string
    topics: Nested<{ name: string }>
    academic_scopes: Nested<{ name: string }>
  }

  const flow = (flowRows ?? []) as unknown as FlowRow[]

  const scopeMap = new Map<string, string>()
  for (const row of flow) {
    if (!scopeMap.has(row.scope_id)) {
      scopeMap.set(row.scope_id, one(row.academic_scopes)?.name ?? 'Kapsam')
    }
  }

  const scopes: PoolScope[] = [...scopeMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  const activeScopeId =
    requestedScopeId && scopes.some(s => s.id === requestedScopeId)
      ? requestedScopeId
      : (scopes[0]?.id ?? null)

  const empty: PoolData = {
    scopes,
    activeScopeId,
    rows: [],
    bookIdsByTopic: new Map(),
  }

  if (!activeScopeId) return empty

  const topicsInScope = flow.filter(f => f.scope_id === activeScopeId)
  const topicIds = [...new Set(topicsInScope.map(f => f.topic_id))]
  if (topicIds.length === 0) return empty

  const [{ data: contactRows }, openByTopic, { data: overrideRows }, { data: bookRows }] =
    await Promise.all([
      // Son temas: onaylı çalışmadan TÜRETİLEN + elle girilen ders /
      // serbest çalışma birleşimi (041 view'ı).
      supabase
        .from('student_topic_contact_view')
        .select('topic_id, last_contact_date, last_contact_source, last_contact_amount')
        .eq('student_id', studentId)
        .eq('workspace_id', workspaceId)
        .in('topic_id', topicIds),
      // Açık çalışma: konu "Aktif Çalışma" ise havuzda görünmez.
      loadOpenWorkByTopic(supabase, { workspaceId, studentId, topicIds }),
      supabase
        .from('student_topic_overrides')
        .select('topic_id, keep_active')
        .eq('student_id', studentId)
        .eq('workspace_id', workspaceId)
        .in('topic_id', topicIds),
      // Konunun çalışıldığı kaynaklar. Kitap id'si de alınır: öğrenci
      // ekranı "bu konuya git" bağlantısı kurabilsin.
      supabase
        .from('book_sections')
        .select('topic_id, book_id, books(title)')
        .eq('workspace_id', workspaceId)
        .in('topic_id', topicIds),
    ])

  const contactByTopic = new Map(
    (
      (contactRows ?? []) as {
        topic_id: string
        last_contact_date: string
        last_contact_source: string
        last_contact_amount: number
      }[]
    ).map(r => [r.topic_id, r])
  )

  const overrideByTopic = new Map(
    ((overrideRows ?? []) as { topic_id: string; keep_active: boolean }[]).map(r => [
      r.topic_id,
      r.keep_active,
    ])
  )

  const booksByTopic = new Map<string, string[]>()
  const bookIdsByTopic = new Map<string, string[]>()
  for (const row of (bookRows ?? []) as unknown as {
    topic_id: string
    book_id: string
    books: Nested<{ title: string }>
  }[]) {
    const title = one(row.books)?.title
    if (!title) continue

    const titles = booksByTopic.get(row.topic_id) ?? []
    if (!titles.includes(title)) titles.push(title)
    booksByTopic.set(row.topic_id, titles)

    const ids = bookIdsByTopic.get(row.topic_id) ?? []
    if (!ids.includes(row.book_id)) ids.push(row.book_id)
    bookIdsByTopic.set(row.topic_id, ids)
  }

  const scopeName = scopeMap.get(activeScopeId) ?? 'Kapsam'
  const nameByTopic = new Map(
    topicsInScope.map(f => [f.topic_id, one(f.topics)?.name ?? 'Konu'])
  )

  const rows: PoolRowInput[] = topicIds.map(topicId => {
    const contact = contactByTopic.get(topicId)
    return {
      topicId,
      topicName: nameByTopic.get(topicId) ?? 'Konu',
      scopeId: activeScopeId,
      scopeName,
      lastContactDate: contact?.last_contact_date ?? null,
      lastContactSource:
        (contact?.last_contact_source as PoolRowInput['lastContactSource']) ?? null,
      lastContactAmount: Number(contact?.last_contact_amount ?? 0),
      openWorkCount: Number(openByTopic.get(topicId) ?? 0),
      keepActive: overrideByTopic.get(topicId) === true,
      bookTitles: booksByTopic.get(topicId) ?? [],
    }
  })

  return { scopes, activeScopeId, rows, bookIdsByTopic }
}
