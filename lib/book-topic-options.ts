import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from './fetch-all'
import { scopeTier, TIER_ORDER, type ScopeTier } from './topic-relevance'

// KİTABIN KONU SEÇENEKLERİ (Kitap Girişi ve Konu Eşleme 2a) — düzenleme
// ekranı ve toplu eşleme ekranı AYNI listeyi görür.
//
// R7-02 §8'in süzgeci ders alanı boş kapsamları da alıyordu; şablondan
// açılan kapsamların alanları boş olduğundan pratikte her ders
// listeleniyordu (27.11 kabul testi: Matematik kitabında AYT Din,
// Coğrafya...). Artık kapsamlar SÜZÜLMEZ, KADEMELENİR: kademe ad
// sözcüklerine de bakar (lib/topic-relevance.ts). Hiçbir konu gizlenmez —
// eşleme imkânsız hale gelmez.

export interface BookTopicOption {
  id: string
  name: string
  scopeName: string
  tier: ScopeTier
}

export async function loadBookTopicOptions(
  supabase: SupabaseClient,
  { workspaceId, subject, levelExam }: { workspaceId: string; subject: string | null; levelExam: string | null }
): Promise<{ topics: BookTopicOption[]; filtered: boolean }> {
  const { data: scopeRows } = await supabase
    .from('academic_scopes')
    .select('id, name, subject, level_exam')
    .eq('workspace_id', workspaceId)
    .eq('active', true)
  const scopes = ((scopeRows ?? []) as { id: string; name: string; subject: string | null; level_exam: string | null }[])
    .map(s => ({
      ...s,
      tier: scopeTier({ id: s.id, name: s.name, subject: s.subject, levelExam: s.level_exam }, { subject, levelExam }),
    }))
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || a.name.localeCompare(b.name, 'tr'))

  // Kitabın dersine uyan kapsam hiç yoksa seçici bunu söyler.
  const filtered = scopes.some(s => s.tier !== 'other')
  if (scopes.length === 0) return { topics: [], filtered }

  const scopeById = new Map(scopes.map(s => [s.id, s]))
  const scopeRank = new Map(scopes.map((s, i) => [s.id, i]))

  // H03 (İz V2): tek istek 1000 satırda kesiliyordu — tüm konular sayfalı okunur.
  const { data: topicRows } = await fetchAllRows<{ id: string; name: string; scope_id: string }>((from, to) =>
    supabase
      .from('topics')
      .select('id, name, scope_id')
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .in('scope_id', scopes.map(s => s.id))
      .order('sort_order')
      .order('name')
      .order('id')
      .range(from, to)
  )

  // Konular kapsam kademesi sırasında; kapsam içi sıra sorgudan korunur.
  const topics = (topicRows ?? [])
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (scopeRank.get(a.t.scope_id) ?? 0) - (scopeRank.get(b.t.scope_id) ?? 0) || a.i - b.i)
    .map(({ t }) => ({
      id: t.id,
      name: t.name,
      scopeName: scopeById.get(t.scope_id)?.name ?? 'Kapsam',
      tier: scopeById.get(t.scope_id)?.tier ?? ('other' as ScopeTier),
    }))
  return { topics, filtered }
}
