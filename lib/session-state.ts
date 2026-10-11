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
