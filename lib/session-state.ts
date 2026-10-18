// OTURUM DURUMU + TELAFİ — M1.0-02 §4-§5 ve §13 (migration 140).
//
// İKİ AYRI EKSEN, TEK ENUM DEĞİL:
//   status        planlandi / yapildi / yapilmadi / iptal   (oturumun sonucu)
//   makeup_status none / decision_pending / planned /
//                 not_required / completed                  (telafi süreci)
// Plan değişikliği bir durum değildir (plan geçmişi); ödeme durumu da
// oturum durumu değildir (finans).
//
// Telafi durumu ELLE yönetilmez; veritabanı tetikleyicisi türetir.
// Buradaki `deriveMakeupStatus` aynı kuralın (PARITY makeup_status) TS
// aynasıdır ve yalnız test + iyimser arayüz güncellemesi için vardır.

import type { SessionStatus } from '@/lib/service-structure'

export type MakeupStatus = 'none' | 'decision_pending' | 'planned' | 'not_required' | 'completed'

export const MAKEUP_STATUS_LABEL: Record<MakeupStatus, string> = {
  none: '',
  decision_pending: 'Telafi kararı bekliyor',
  planned: 'Telafi planlandı',
  not_required: 'Telafi edilmeyecek',
  completed: 'Telafi tamamlandı',
}

export const MAKEUP_STATUS_VARIANT: Record<
  MakeupStatus,
  'success' | 'warning' | 'destructive' | 'info' | 'neutral'
> = {
  none: 'neutral',
  decision_pending: 'warning',
  planned: 'info',
  not_required: 'neutral',
  completed: 'success',
}

export type SessionSource = 'takvim' | 'elle' | 'telafi'

/** Yapıldı panelinin hazır birimleri; "Özel" serbest giriş. */
export const UNIT_PRESETS = [0.5, 1, 1.5, 2] as const

export function formatUnits(units: number | null | undefined): string {
  if (units == null) return '—'
  const text = Number.isInteger(units) ? String(units) : units.toFixed(2).replace(/0$/, '').replace('.', ',')
  return `${text} ders`
}

export function deriveMakeupStatus(input: {
  status: SessionStatus
  isMakeup: boolean
  makeupDecision: 'pending' | 'waived' | null
  childStatuses: SessionStatus[]
}): MakeupStatus {
  // PARITY-BEGIN makeup_status
  if (input.status !== 'yapilmadi' || input.isMakeup) return 'none'
  if (input.childStatuses.includes('yapildi')) return 'completed'
  if (input.childStatuses.includes('planlandi')) return 'planned'
  if (input.makeupDecision === 'waived') return 'not_required'
  return 'decision_pending'
  // PARITY-END makeup_status
}

/**
 * Tablodaki tek "Durum" metni. Telafi oturumu planlıyken "Telafi
 * planlandı"; yapılmamış asıl oturumda telafi süreci durumun yerine
 * geçer ("Telafi kararı bekliyor" yapılmadı'dan daha çok şey söyler).
 */
export function sessionDisplayStatus(row: {
  status: SessionStatus
  makeupStatus: MakeupStatus
  isMakeup: boolean
}): { label: string; variant: 'success' | 'warning' | 'destructive' | 'info' | 'neutral' } {
  if (row.isMakeup && row.status === 'planlandi') return { label: 'Telafi planlandı', variant: 'info' }
  if (row.status === 'yapilmadi' && row.makeupStatus !== 'none') {
    return { label: MAKEUP_STATUS_LABEL[row.makeupStatus], variant: MAKEUP_STATUS_VARIANT[row.makeupStatus] }
  }
  switch (row.status) {
    case 'planlandi':
      return { label: 'Planlandı', variant: 'neutral' }
    case 'yapildi':
      return { label: 'Yapıldı', variant: 'success' }
    case 'yapilmadi':
      return { label: 'Yapılmadı', variant: 'destructive' }
    case 'iptal':
      return { label: 'İptal edildi', variant: 'neutral' }
  }
}

/** Plan değişti mi? `09:00 → 21:15` gösterimi yalnız değiştiyse. */
export function planMoved(plannedAt: string, currentPlannedAt: string | null | undefined): boolean {
  return !!currentPlannedAt && new Date(currentPlannedAt).getTime() !== new Date(plannedAt).getTime()
}

// ============================================================
// AYLIK HİZMET ÖZETİ — "Ders 3/5 yapıldı" (M1.0-02 §5)
//
// PAYDA YALNIZ TAKVİMLİ RİTİMDE: sabit haftalık hizmette payda takvimin
// ürettiği oturum sayısıdır, anlamlıdır. Esnek ritimde aylık hedef yoktur;
// payda yalnız elle eklenmiş oturum sayısı olurdu ("1/2" yanıltıcı —
// Finans TEST 02). Esnek kısım "1 yapıldı, 1 planlı" diye sayılır.
// ============================================================

export interface MonthCounterRow {
  kind: 'ders' | 'kocluk'
  /** Hizmetin ritmi esnek mi (takvim üretmez). */
  flexible: boolean
  /** İptal dışı oturum sayısı (student_service_month_view.planlanan). */
  planlanan: number
  yapilan: number
  /** Henüz sonucu girilmemiş (planlandi) oturumlar. */
  bekleyen: number
  ek_ders: number | null
  telafi_bekleyen: number | null
}

export interface KindMonthCount {
  fixedDone: number
  fixedPlanned: number
  flexDone: number
  flexOpen: number
}

export interface MonthSummary {
  monthLabel: string
  ders: KindMonthCount
  kocluk: KindMonthCount
  makeupPending: number
  extra: number
}

function kindCount(rows: MonthCounterRow[], kind: 'ders' | 'kocluk'): KindMonthCount {
  const out: KindMonthCount = { fixedDone: 0, fixedPlanned: 0, flexDone: 0, flexOpen: 0 }
  for (const r of rows) {
    if (r.kind !== kind) continue
    if (r.flexible) {
      out.flexDone += Number(r.yapilan ?? 0)
      out.flexOpen += Number(r.bekleyen ?? 0)
    } else {
      out.fixedDone += Number(r.yapilan ?? 0)
      out.fixedPlanned += Number(r.planlanan ?? 0)
    }
  }
  return out
}

export function buildMonthSummary(monthLabel: string, rows: MonthCounterRow[]): MonthSummary {
  return {
    monthLabel,
    ders: kindCount(rows, 'ders'),
    kocluk: kindCount(rows, 'kocluk'),
    makeupPending: rows.reduce((n, r) => n + Number(r.telafi_bekleyen ?? 0), 0),
    extra: rows.reduce((n, r) => n + Number(r.ek_ders ?? 0), 0),
  }
}

function kindPart(label: string, c: KindMonthCount): string | null {
  const fixed = c.fixedPlanned > 0 ? `${label} ${c.fixedDone}/${c.fixedPlanned} yapıldı` : null
  const hasFlex = c.flexDone > 0 || c.flexOpen > 0
  if (!hasFlex) return fixed
  const flexText =
    `${c.flexDone} yapıldı` + (c.flexOpen > 0 ? `, ${c.flexOpen} planlı` : '')
  return fixed ? `${fixed} + esnek ${flexText}` : `${label} ${flexText}`
}

export function monthSummaryLine(s: MonthSummary): string {
  const parts = [kindPart('Ders', s.ders), kindPart('Koçluk', s.kocluk)].filter(
    (p): p is string => p !== null
  )
  if (s.makeupPending > 0) parts.push(`Telafi ${s.makeupPending} bekliyor`)
  if (s.extra > 0) parts.push(`Ek ders ${s.extra}`)
  return parts.length ? `${s.monthLabel}: ${parts.join(' · ')}` : `${s.monthLabel}: planlanmış hizmet yok`
}
