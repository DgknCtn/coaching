// Finans ekranlarının ortak veri okuma yardımcıları (M1.0-02 §6-§7).
//
// Ana ekran ile öğrenci detayı AYNI satırlardan ve aynı cari hesap
// fonksiyonlarından (lib/finance-ledger) beslenir: iki ekran iki ayrı
// toplam hesaplarsa "listede 3.750, detayda 5.000" sorusu doğar.

import type { AccrualKind, LedgerAccrual, LedgerPayment } from '@/lib/finance-ledger'

export const ACCRUAL_SELECT =
  'id, student_id, lesson_date, quantity, unit_price_kurus, kind, unit_count, rate_kurus, note, service_session_id'

export const PAYMENT_SELECT =
  'id, student_id, paid_on, amount_kurus, method, account, applies_to_month, note'

export const EXPENSE_SELECT =
  'id, category, student_id, session_id, payment_id, amount_kurus, spent_on, note'

export interface AccrualRow extends LedgerAccrual {
  studentId: string
  unitCount: number | null
  rateKurus: number | null
  note: string | null
  auto: boolean
}

export interface PaymentRow extends LedgerPayment {
  studentId: string
  method: string
  account: string | null
  note: string | null
}

export interface ExpenseRow {
  id: string
  category: 'sabit' | 'ogrenci' | 'oturum' | 'kesinti'
  studentId: string | null
  amountKurus: number
  date: string
  note: string | null
}

type Row = Record<string, unknown>

export function mapAccrual(r: Row): AccrualRow {
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    date: r.lesson_date as string,
    // 066'dan beri toplam = quantity × unit_price (141: otomatik satırda
    // quantity 1, unit_price satır tutarı).
    amountKurus: Number(r.quantity ?? 1) * Number(r.unit_price_kurus ?? 0),
    kind: ((r.kind as string | null) ?? 'ders') as AccrualKind,
    unitCount: r.unit_count == null ? (r.kind === 'ders' ? Number(r.quantity ?? 1) : null) : Number(r.unit_count),
    rateKurus: r.rate_kurus == null ? null : Number(r.rate_kurus),
    note: (r.note as string | null) ?? null,
    auto: r.service_session_id != null,
  }
}

export function mapPayment(r: Row): PaymentRow {
  return {
    id: r.id as string,
    studentId: r.student_id as string,
    date: r.paid_on as string,
    amountKurus: Number(r.amount_kurus ?? 0),
    appliesToMonth: (r.applies_to_month as string | null) ?? null,
    method: (r.method as string | null) ?? 'nakit',
    account: (r.account as string | null) ?? null,
    note: (r.note as string | null) ?? null,
  }
}

export function mapExpense(r: Row): ExpenseRow {
  return {
    id: r.id as string,
    category: r.category as ExpenseRow['category'],
    studentId: (r.student_id as string | null) ?? null,
    amountKurus: Number(r.amount_kurus ?? 0),
    date: r.spent_on as string,
    note: (r.note as string | null) ?? null,
  }
}

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseRow['category'], string> = {
  sabit: 'Sabit gider',
  ogrenci: 'Öğrenciye bağlı',
  oturum: 'Oturuma bağlı',
  kesinti: 'Kesinti (banka/vergi)',
}

/** Bugünün 'YYYY-MM'i (Istanbul). */
export function currentMonth(todayIso: string): string {
  return todayIso.slice(0, 7)
}
