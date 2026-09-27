// MÜDAHALE (B16 · 118) — sözlük ve saf yardımcılar.

export type InterventionOutcome = 'duzeldi' | 'degismedi' | 'diger'

export const OUTCOME_LABEL: Record<InterventionOutcome, string> = {
  duzeldi: 'Düzeldi',
  degismedi: 'Değişmedi',
  diger: 'Başka / yanlışlıkla açıldı',
}

export interface InterventionRow {
  id: string
  status: 'open' | 'closed'
  opened_status: string
  opened_signals: string[]
  note: string | null
  session_id: string | null
  opened_at: string
  outcome: InterventionOutcome | null
  close_note: string | null
  closed_at: string | null
}

/** "3 gündür açık" — açık müdahalenin yaşı (tam gün). */
export function openDays(openedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(openedAt).getTime()) / 86_400_000))
}
