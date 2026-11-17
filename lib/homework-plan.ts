// ÖDEV PLANI — Revize Mini 05 + Mini 06 (1. aşama), migration 156.
//
// "Ödev Planı" öğrenci başına sıralı bir kayıttır: 1. Ödev Planı, 2. Ödev
// Planı… Numara yalnız YENİ ve AYRI bir plan yayımlanınca artar; plana
// ekleme, teslim uzatma, devir, mesajı yeniden kopyalama ya da takvimde yeni
// haftaya geçmek numara üretmez. Numaralı ön ek sistemden, açıklama
// öğretmenden gelir; sıra başlığın içindeki rakamdan HESAPLANMAZ.
//
// Bu modül SAF: başlık, sonuç sayımı ve sepetin varsayılan hedefi. Aynı
// tanımlar SQL'de (_homework_plan_title, _homework_plan_result) — ikisi
// testte eşlenir; ayrışırsa kart ile kapanış sonucu farklı sayardı.

export interface HomeworkPlanRef {
  id: string
  planNo: number
  titleSuffix: string | null
  /** Geçişte korunan eski başlık ("5. Hafta Ödevi"); varsa AYNEN gösterilir. */
  legacyTitle: string | null
  publishedAt: string
  initialDueAt: string | null
  dueAt: string | null
  status: 'open' | 'closed'
  closedAt: string | null
  closingResult: PlanResult | null
  /** Planın kitap partisi (en fazla bir); yalnız görevli planda null. */
  batchId: string | null
}

export function planPrefix(planNo: number): string {
  return `${planNo}. Ödev Planı`
}

export function planDisplayTitle(
  plan: Pick<HomeworkPlanRef, 'planNo' | 'titleSuffix' | 'legacyTitle'>
): string {
  if (plan.legacyTitle) return plan.legacyTitle
  const suffix = plan.titleSuffix?.trim()
  return suffix ? `${planPrefix(plan.planNo)} · ${suffix}` : planPrefix(plan.planNo)
}

/** Yeni planın numarası: öğrencinin en büyük numarası + 1 (gerçek kayıtlardan). */
export function nextPlanNo(plans: Pick<HomeworkPlanRef, 'planNo'>[]): number {
  return plans.reduce((max, p) => Math.max(max, p.planNo), 0) + 1
}

/**
 * Sepetin varsayılan hedefi (karar): son teslimi GEÇMEMİŞ son açık plan;
 * yoksa yeni plan (null). Öğretmen hedefi değiştirebilir.
 */
export function defaultTargetPlan<T extends Pick<HomeworkPlanRef, 'planNo' | 'status' | 'dueAt'>>(
  plans: T[],
  now: Date = new Date()
): T | null {
  return (
    [...plans]
      .filter(p => p.status === 'open' && (!p.dueAt || new Date(p.dueAt) > now))
      .sort((a, b) => b.planNo - a.planNo)[0] ?? null
  )
}

// ============================================================
// SONUÇ — "verilen" iptal edilenleri DÜŞMEZ (Mini 06)
//
// Testte devirden sonra ilk plan 2/6 → 2/4 görünüyordu: kart iptal
// kalemleri toplamdan çıkarıyordu. Devir ya da aktif yükten çıkarma eski
// planın VERİLEN toplamını azaltmaz; ayrıca yazılır. Onay bekleyen iş
// "yapılmadı" diye kesinleştirilmez.
// ============================================================

export interface PlanItemLike {
  /** pending | pending_approval | completed | cancelled */
  status: string
  carriedToItemId?: string | null
}

export interface PlanResult {
  given: number
  done: number
  pendingApproval: number
  remaining: number
  carried: number
  released: number
  tasksDone: number
  tasksOpen: number
  tasksClosed: number
}

export function planResult(
  items: PlanItemLike[],
  tasks: { status: string }[] = []
): PlanResult {
  return {
    given: items.length,
    done: items.filter(i => i.status === 'completed').length,
    pendingApproval: items.filter(i => i.status === 'pending_approval').length,
    remaining: items.filter(i => i.status === 'pending').length,
    carried: items.filter(i => i.status === 'cancelled' && !!i.carriedToItemId).length,
    released: items.filter(i => i.status === 'cancelled' && !i.carriedToItemId).length,
    tasksDone: tasks.filter(t => t.status === 'done').length,
    tasksOpen: tasks.filter(t => t.status === 'open').length,
    tasksClosed: tasks.filter(t => t.status === 'closed').length,
  }
}

/** Yapılan / verilen yüzdesi, bir ondalık; verilen yoksa null. */
export function planPercent(r: Pick<PlanResult, 'given' | 'done'>): number | null {
  if (r.given <= 0) return null
  return Math.round((r.done / r.given) * 1000) / 10
}

/** "2/6 · %33,3 · 2 devredildi · 1 onay bekliyor" */
export function planResultLine(r: PlanResult): string {
  const pct = planPercent(r)
  return [
    `${r.done}/${r.given}`,
    pct !== null ? `%${pct.toLocaleString('tr-TR')}` : null,
    r.carried > 0 ? `${r.carried} devredildi` : null,
    r.released > 0 ? `${r.released} aktif yükten çıkarıldı` : null,
    r.pendingApproval > 0 ? `${r.pendingApproval} onay bekliyor` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** SQL closing_result (snake_case) → PlanResult. */
export function parseClosingResult(raw: unknown): PlanResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const n = (k: string) => Number(r[k] ?? 0)
  return {
    given: n('given'),
    done: n('done'),
    pendingApproval: n('pending_approval'),
    remaining: n('remaining'),
    carried: n('carried'),
    released: n('released'),
    tasksDone: n('tasks_done'),
    tasksOpen: n('tasks_open'),
    tasksClosed: n('tasks_closed'),
  }
}
