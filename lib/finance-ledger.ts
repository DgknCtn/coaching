// ÖĞRENCİ CARİ HESABI — M1.0-02 §7 (karar 11 Ekim 2026).
//
// Bakiye öğrenci düzeyinde YÜRÜR: tahakkuklar (ders, ek ders, aylık ücret,
// devir) borç, tahsilatlar alacak. Tahsilat en eski açık tahakkuktan
// başlayarak kapatır (FIFO); "belirli döneme uygula" denmişse önce o
// dönemin tahakkuklarına gider. Fazlası ALACAK olarak durur ve sonraki
// tahakkuku kapatır.
//
// GEÇMİŞ DÖNEM TOPLAMI DEĞİŞMEZ: bir dönemin "Dönem Toplamı" yalnız o
// dönemin tahakkuklarıdır. Devreden bakiye ayrı satırdır
// (§7 "Devreden bakiye": Eylül toplamı geçmiş raporda değişmez).
//
// Gerçek örnek (görseldeki not): devir 3.800 + 10 × 4.000 = 43.800 borç,
// 7 Temmuz 44.000 tahsil → bakiye −200 (alacak).
//
// SAF modül.

export type AccrualKind = 'ders' | 'ek_ders' | 'aylik' | 'devir' | 'manuel'

export interface LedgerAccrual {
  id: string
  /** 'YYYY-MM-DD' — dönem ataması bu tarihin ayından. */
  date: string
  amountKurus: number
  kind: AccrualKind
}

export interface LedgerPayment {
  id: string
  date: string
  amountKurus: number
  /** 'YYYY-MM-01' — "belirli döneme uygula". */
  appliesToMonth?: string | null
}

export const ACCRUAL_KIND_LABEL: Record<AccrualKind, string> = {
  ders: 'Ders',
  ek_ders: 'Ek ders',
  aylik: 'Aylık sabit',
  devir: 'Devreden bakiye',
  manuel: 'Diğer tahakkuk',
}

export type PeriodState = 'odendi' | 'kismi' | 'bekliyor' | 'alacak' | 'yok'

export const PERIOD_STATE_LABEL: Record<PeriodState, string> = {
  odendi: 'Ödendi',
  kismi: 'Kısmi',
  bekliyor: 'Bekliyor',
  alacak: 'Alacaklı',
  yok: '—',
}

export interface AllocationResult {
  /** Her tahakkukun kapanan kısmı. */
  paidByAccrual: Map<string, number>
  /** Hiçbir tahakkuka düşmeyen fazla ödeme. */
  creditKurus: number
}

const monthOf = (date: string) => date.slice(0, 7)

function byDateThenId<T extends { date: string; id: string }>(a: T, b: T): number {
  return a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)
}

/**
 * FIFO dağıtım. Ödemeler tarih sırasıyla işlenir; dönemi belirtilmiş
 * ödeme önce o dönemin açık tahakkuklarını kapatır, artanı genel FIFO'ya
 * döner. Sıfır TL'lik tahakkuk (ücretlendirilmeyen ay) atlanır.
 */
export function allocatePayments(
  accruals: LedgerAccrual[],
  payments: LedgerPayment[]
): AllocationResult {
  const open = accruals
    .filter((a) => a.amountKurus > 0)
    .sort(byDateThenId)
    .map((a) => ({ ...a, remaining: a.amountKurus }))
  const paidByAccrual = new Map<string, number>(accruals.map((a) => [a.id, 0]))
  let creditKurus = 0

  const apply = (target: typeof open, amount: number): number => {
    let left = amount
    for (const a of target) {
      if (left <= 0) break
      if (a.remaining <= 0) continue
      const take = Math.min(a.remaining, left)
      a.remaining -= take
      left -= take
      paidByAccrual.set(a.id, (paidByAccrual.get(a.id) ?? 0) + take)
    }
    return left
  }

  for (const p of [...payments].sort(byDateThenId)) {
    let left = p.amountKurus
    if (p.appliesToMonth) {
      const month = monthOf(p.appliesToMonth)
      left = apply(open.filter((a) => monthOf(a.date) === month), left)
    }
    left = apply(open, left)
    creditKurus += left
  }

  // Sonradan doğan tahakkuk da birikmiş alacağa düşer: dağıtım sırası
  // ödemenin tarihine değil açık tahakkukun sırasına bağlı olduğundan
  // yukarıdaki döngü bunu zaten kapsar (tüm tahakkuklar baştan açık).
  return { paidByAccrual, creditKurus }
}

export interface PeriodSummary {
  /** 'YYYY-MM' */
  month: string
  /** Dönem başından önceki bakiye (+ borç, − alacak). */
  carriedInKurus: number
  /** Bu dönemin tahakkukları — geçmişte değişmez. */
  periodAccruedKurus: number
  /** Bu dönemde alınan para. */
  periodCollectedKurus: number
  /** Dönem sonu bakiyesi = devreden + dönem − tahsil. */
  closingBalanceKurus: number
  state: PeriodState
}

/** Seçili ay için öğrencinin dönem satırı (Finans ana tablo + öğrenci detayı). */
export function periodSummary(
  accruals: LedgerAccrual[],
  payments: LedgerPayment[],
  month: string
): PeriodSummary {
  const before = (d: string) => monthOf(d) < month
  const inMonth = (d: string) => monthOf(d) === month

  const sum = <T extends { amountKurus: number; date: string }>(rows: T[], f: (d: string) => boolean) =>
    rows.reduce((acc, r) => (f(r.date) ? acc + r.amountKurus : acc), 0)

  const carriedInKurus = sum(accruals, before) - sum(payments, before)
  const periodAccruedKurus = sum(accruals, inMonth)
  const periodCollectedKurus = sum(payments, inMonth)
  const closingBalanceKurus = carriedInKurus + periodAccruedKurus - periodCollectedKurus

  return {
    month,
    carriedInKurus,
    periodAccruedKurus,
    periodCollectedKurus,
    closingBalanceKurus,
    state: balanceState(closingBalanceKurus, periodAccruedKurus + Math.max(carriedInKurus, 0), periodCollectedKurus),
  }
}

/**
 * Dönem durumu:
 *  - bakiye < 0           → Alacaklı (fazla ödeme)
 *  - bakiye = 0, borç var → Ödendi
 *  - borç yok             → —
 *  - bakiye > 0, tahsil 0 → Bekliyor; tahsil > 0 → Kısmi
 */
export function balanceState(
  closingBalanceKurus: number,
  dueKurus: number,
  collectedKurus: number
): PeriodState {
  if (closingBalanceKurus < 0) return 'alacak'
  if (closingBalanceKurus === 0) return dueKurus > 0 || collectedKurus > 0 ? 'odendi' : 'yok'
  return collectedKurus > 0 ? 'kismi' : 'bekliyor'
}

/** Bugün itibarıyla toplam bakiye (+ borç, − alacak). */
export function currentBalance(accruals: LedgerAccrual[], payments: LedgerPayment[]): number {
  const a = accruals.reduce((s, r) => s + r.amountKurus, 0)
  const p = payments.reduce((s, r) => s + r.amountKurus, 0)
  return a - p
}

/** Bir dönemin tahakkuk satırları, tarih sırasıyla. */
export function periodLines(accruals: LedgerAccrual[], month: string): LedgerAccrual[] {
  return accruals.filter((a) => monthOf(a.date) === month).sort(byDateThenId)
}

/** 'YYYY-MM' ayını kaydırır. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

export function isValidMonth(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

/** '2026-10' → 'Ekim 2026' */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS_TR[m - 1]} ${y}`
}
