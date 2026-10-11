// TARİHSEL FİYAT — M1.0-02 §3 "Fiyat değişikliği" (migration 139).
//
// Fiyat overwrite edilmez: her değişiklik `valid_from` tarihli yeni bir
// sürümdür. Bir tarihte geçerli fiyat = o tarihe kadar (dahil) başlamış
// EN SON sürüm. SQL'deki `price_at` ile birebir aynı kural
// (tests/pricing-history.test.ts parity kontrolü).
//
// SAF modül: Supabase'e dokunmaz.

export type PriceType = 'aylik' | 'ek_ders' | 'ders_basi'
export type FinanceModel = 'aylik_sabit' | 'ders_basi'
export type CollectionTiming = 'ay_basi' | 'ay_sonu' | 'ders_sonrasi'

export interface PriceVersion {
  id?: string
  priceType: PriceType
  amountKurus: number
  /** 'YYYY-MM-DD' */
  validFrom: string
  /** Aynı gün iki sürümde sonraki kazanır (SQL: created_at DESC). */
  createdAt?: string
}

export interface FinanceModelVersion {
  id?: string
  model: FinanceModel
  collectionTiming: CollectionTiming
  validFrom: string
  createdAt?: string
}

export const FINANCE_MODEL_LABEL: Record<FinanceModel, string> = {
  aylik_sabit: 'Aylık Sabit',
  ders_basi: 'Ders Başı',
}

export const COLLECTION_TIMING_LABEL: Record<CollectionTiming, string> = {
  ay_basi: 'Ay başı',
  ay_sonu: 'Ay sonu',
  ders_sonrasi: 'Ders sonrası',
}

export const PRICE_TYPE_LABEL: Record<PriceType, string> = {
  aylik: 'Aylık tutar',
  ek_ders: 'Ek ders',
  ders_basi: 'Ders başı',
}

/** Modelin izin verdiği tahsilat zamanları (139: student_finance_models_timing_chk). */
export const TIMING_OPTIONS: Record<FinanceModel, CollectionTiming[]> = {
  aylik_sabit: ['ay_basi', 'ay_sonu'],
  ders_basi: ['ders_sonrasi', 'ay_sonu'],
}

function latestAt<T extends { validFrom: string; createdAt?: string }>(
  rows: T[],
  date: string
): T | null {
  let best: T | null = null
  for (const row of rows) {
    if (row.validFrom > date) continue
    if (
      !best ||
      row.validFrom > best.validFrom ||
      (row.validFrom === best.validFrom && (row.createdAt ?? '') > (best.createdAt ?? ''))
    ) {
      best = row
    }
  }
  return best
}

/** `date` ('YYYY-MM-DD') tarihinde geçerli fiyat; yoksa null ("fiyat yok" ≠ 0 TL). */
export function priceAt(versions: PriceVersion[], type: PriceType, date: string): number | null {
  return latestAt(versions.filter((v) => v.priceType === type), date)?.amountKurus ?? null
}

/** `date` tarihinde geçerli ücretlendirme modeli. */
export function modelAt(models: FinanceModelVersion[], date: string): FinanceModelVersion | null {
  return latestAt(models, date)
}

/**
 * Bir fiyat türünün geçmişi, yeniden eskiye, her sürümün bitişiyle.
 * `01.10.2026: 12.500 TL | 01.01.2027: 14.000 TL` gösterimi için.
 */
export function priceHistory(
  versions: PriceVersion[],
  type: PriceType
): (PriceVersion & { validTo: string | null })[] {
  const sorted = versions
    .filter((v) => v.priceType === type)
    .sort((a, b) => (a.validFrom === b.validFrom
      ? (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
      : a.validFrom.localeCompare(b.validFrom)))
  // Aynı gün tekrarları: son yazılan geçerli.
  const dedup: PriceVersion[] = []
  for (const v of sorted) {
    if (dedup.length && dedup[dedup.length - 1].validFrom === v.validFrom) dedup[dedup.length - 1] = v
    else dedup.push(v)
  }
  return dedup
    .map((v, i) => ({
      ...v,
      validTo: i + 1 < dedup.length ? previousDay(dedup[i + 1].validFrom) : null,
    }))
    .reverse()
}

function previousDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - 86_400_000).toISOString().slice(0, 10)
}

/**
 * Bir oturumun hangi fiyat türüyle ücretleneceği — 141'deki
 * `sync_session_accrual` kuralının (PARITY accrual_rule) aynası.
 * null = ücret doğmaz.
 */
export function accrualPriceType(
  financeLink: 'aylik_paket' | 'ders_basi' | 'haric',
  model: FinanceModel | null,
  isExtra: boolean
): PriceType | null {
  if (financeLink === 'haric') return null
  if (financeLink === 'aylik_paket') {
    if (model === 'ders_basi') return 'ders_basi'
    if (model === 'aylik_sabit' && isExtra) return 'ek_ders'
    return null
  }
  return model === 'aylik_sabit' ? 'ek_ders' : 'ders_basi'
}

/** Birim × fiyat, kuruşa yuvarlanmış (SQL: ROUND(rate * units)). */
export function accrualAmount(rateKurus: number, units: number): number {
  return Math.round(rateKurus * units)
}
