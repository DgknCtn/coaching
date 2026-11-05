import { localDateString } from '@/lib/homework-status'
import {
  accrualPriceType,
  modelAt,
  priceAt,
  type FinanceModelVersion,
  type PriceVersion,
} from '@/lib/pricing-history'

// ÜCRET KAYDI OLMAYAN YAPILMIŞ DERSLER — EK-03 (04.11.2026).
//
// Yiğit'in 23 Eylül dersi "Tüm hareketler"de yoktu ve kullanıcı bunun
// eksik bir ücret mi, pakete dahil bir ders mi olduğunu ekrandan
// anlayamıyordu. Kayıtlı 13.000 TL'nin kapanması bütün gerçek derslerin
// hesaba girdiğini KANITLAMAZ.
//
// Bu modül yapılmış her oturuma bakar; tahakkuku olmayanlar için NEDENİ
// 141'deki `sync_session_accrual` sırasıyla türetir. Kural kopyalanmaz:
// fiyat türü kararı `accrualPriceType` (PARITY accrual_rule) aynasından
// gelir. Sonuç bir TEŞHİSTİR — borç eklemez. Yalnız "Tahakkuk eksik"
// satırları için öğretmen elle "Eksik tahakkukları tamamla" der
// (backfill_missing_accruals, idempotent).

export type CoverageReason =
  | 'haric' // hizmet finansa bağlı değil
  | 'katilmadi' // öğrenci katılmadı
  | 'pakete_dahil' // aylık pakete dahil ders (ek ders değil)
  | 'fiyatsiz' // o tarihte fiyat tanımlı değil
  | 'eksik' // kural ücret doğuruyor ama tahakkuk yok

export const COVERAGE_REASON_LABEL: Record<CoverageReason, string> = {
  haric: 'Finansa dahil değil',
  katilmadi: 'Katılmadı',
  pakete_dahil: 'Aylık pakete dahil',
  fiyatsiz: 'O tarihte fiyat yok',
  eksik: 'Tahakkuk eksik',
}

export interface CoverageSession {
  id: string
  serviceId: string | null
  plannedAt: string
  currentPlannedAt: string | null
  actualAt: string | null
  attended: boolean | null
  isExtra: boolean
}

export interface CoverageService {
  id: string
  financeLink: 'aylik_paket' | 'ders_basi' | 'haric' | null
}

export interface UncoveredSession {
  sessionId: string
  /** Gösterim anı: gerçekleşme, yoksa plan. */
  at: string
  reason: CoverageReason
}

export function uncoveredSessions(input: {
  sessions: CoverageSession[]
  services: CoverageService[]
  models: FinanceModelVersion[]
  prices: PriceVersion[]
  /** Tahakkuku olan oturum id'leri (finance_lessons.service_session_id). */
  accruedSessionIds: Set<string>
}): UncoveredSession[] {
  const linkById = new Map(input.services.map(s => [s.id, s.financeLink]))
  const out: UncoveredSession[] = []

  for (const s of input.sessions) {
    if (input.accruedSessionIds.has(s.id)) continue
    const at = s.actualAt ?? s.currentPlannedAt ?? s.plannedAt
    const link = s.serviceId ? (linkById.get(s.serviceId) ?? null) : null

    let reason: CoverageReason
    if (!link || link === 'haric') reason = 'haric'
    else if (s.attended === false) reason = 'katilmadi'
    else {
      // Fiyat GERÇEKLEŞME gününde geçerli olandır (141, §10).
      const priceDate = localDateString(new Date(at))
      const model = modelAt(input.models, priceDate)?.model ?? null
      const type = accrualPriceType(link, model, s.isExtra)
      if (!type) reason = 'pakete_dahil'
      else if (priceAt(input.prices, type, priceDate) === null) reason = 'fiyatsiz'
      else reason = 'eksik'
    }
    out.push({ sessionId: s.id, at, reason })
  }

  return out.sort((a, b) => a.at.localeCompare(b.at))
}
