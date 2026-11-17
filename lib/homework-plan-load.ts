import type { SupabaseClient } from '@supabase/supabase-js'
import { parseClosingResult, type HomeworkPlanRef } from '@/lib/homework-plan'

// Öğrencinin ödev planları (156) — Ödev Planlama'nın hedef seçimi ve
// Genel Bakış kartlarının başlık/sonuç kaynağı. Plan başına en fazla bir
// kitap partisi var; batchId ile eşlenir.

export async function loadHomeworkPlans(
  supabase: SupabaseClient,
  { workspaceId, studentId }: { workspaceId: string; studentId: string }
): Promise<HomeworkPlanRef[]> {
  const [plansRes, batchesRes] = await Promise.all([
    supabase
      .from('homework_plans')
      .select(
        'id, plan_no, title_suffix, legacy_title, published_at, initial_due_at, due_at, status, closed_at, closing_result'
      )
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .order('plan_no', { ascending: false })
      .limit(500),
    supabase
      .from('homework_batches')
      .select('id, plan_id')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .not('plan_id', 'is', null)
      .limit(1000),
  ])
  if (plansRes.error) {
    console.error('[homework-plans] okunamadı:', plansRes.error.message)
    return []
  }

  const batchByPlan = new Map<string, string>()
  for (const b of (batchesRes.data ?? []) as { id: string; plan_id: string }[]) {
    if (!batchByPlan.has(b.plan_id)) batchByPlan.set(b.plan_id, b.id)
  }

  return ((plansRes.data ?? []) as Record<string, unknown>[]).map(r => ({
    id: r.id as string,
    planNo: Number(r.plan_no),
    titleSuffix: (r.title_suffix as string | null) ?? null,
    legacyTitle: (r.legacy_title as string | null) ?? null,
    publishedAt: r.published_at as string,
    initialDueAt: (r.initial_due_at as string | null) ?? null,
    dueAt: (r.due_at as string | null) ?? null,
    status: r.status === 'closed' ? 'closed' : 'open',
    closedAt: (r.closed_at as string | null) ?? null,
    closingResult: parseClosingResult(r.closing_result),
    batchId: batchByPlan.get(r.id as string) ?? null,
  }))
}
