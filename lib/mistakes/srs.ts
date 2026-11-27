// HATA DEFTERİ — ARALIKLI TEKRAR (Leitner, 5 kutu). Saf kural.
//
// Veritabanındaki record_mistake_review (161) BİREBİR bu kuralı uygular;
// tests/mistake-srs-sql-parity.test.ts ikisini karşılaştırır.
//
//   Yeni hata          → kutu 1, tekrar YARIN değil BUGÜN (aynı gün ilk tekrar)
//   "Bildim"           → kutu +1, sonraki tekrar = INTERVALS[yeni kutu] gün sonra
//   kutu 5'te "Bildim" → öğrenildi (status = learned), tekrar yok
//   "Bilemedim"        → kutu 1, tekrar yarın

export const MAX_BOX = 5

/** Kutu → sonraki tekrara gün. Kutu 1 = 1 gün … kutu 5 = 30 gün. */
export const INTERVAL_DAYS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 }

export type ReviewResult = 'knew' | 'missed'

export interface SrsState {
  box: number
  status: 'review' | 'learned' | 'archived'
  /** 'YYYY-MM-DD' (yerel gün); learned ise null. */
  nextReviewOn: string | null
}

/** Yerel gün 'YYYY-MM-DD' + n gün. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function initialState(today: string): SrsState {
  return { box: 1, status: 'review', nextReviewOn: today }
}

export function applyReview(state: SrsState, result: ReviewResult, today: string): SrsState {
  if (result === 'missed') return { box: 1, status: 'review', nextReviewOn: addDays(today, INTERVAL_DAYS[1]) }
  if (state.box >= MAX_BOX) return { box: MAX_BOX, status: 'learned', nextReviewOn: null }
  const box = Math.max(1, state.box) + 1
  return { box, status: 'review', nextReviewOn: addDays(today, INTERVAL_DAYS[box]) }
}

/** Bugün (ya da geçmişte kalmış) tekrarı gelen mi. */
export function isDue(s: Pick<SrsState, 'status' | 'nextReviewOn'>, today: string): boolean {
  return s.status === 'review' && !!s.nextReviewOn && s.nextReviewOn <= today
}

/** Önümüzdeki 7 gün: gün başına tekrar sayısı. Gecikenler BUGÜNE sayılır. */
export function weekAhead(items: Pick<SrsState, 'status' | 'nextReviewOn'>[], today: string): { day: string; count: number }[] {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const counts = new Map(days.map(d => [d, 0]))
  for (const it of items) {
    if (it.status !== 'review' || !it.nextReviewOn) continue
    const d = it.nextReviewOn < today ? today : it.nextReviewOn
    if (counts.has(d)) counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  return days.map(d => ({ day: d, count: counts.get(d) ?? 0 }))
}
