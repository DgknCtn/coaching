import { formatKurus, formatKurusShort } from '@/lib/billing/pricing'
import {
  ACCRUAL_KIND_LABEL,
  allocatePayments,
  monthLabel,
  type AccrualKind,
  type LedgerAccrual,
  type LedgerPayment,
} from '@/lib/finance-ledger'
import { formatUnits } from '@/lib/session-state'
import { formatIsoDayDate } from '@/lib/service-structure'

// VELİ HESAP ÖZETİ — İz V2 R09.
//
// "Aynı cari hesabın paylaşılabilir özeti; yeni muhasebe altyapısı değil."
// Finans ekranındaki tahakkuk ve tahsilatlardan, AYNI FIFO dağıtımıyla
// (allocatePayments) üretilir — ekranda "açık" görünen ile özette "açık"
// yazan ayrışamaz.
//
// İÇERİK SINIRI: iç giderler, kesintiler ve öğretmene özel notlar özete
// GİRMEZ. Bu modül not alanını hiç okumaz; gider satırı zaten girdi değil.

export interface SummaryAccrual extends LedgerAccrual {
  unitCount: number | null
}

export interface OpenLine {
  id: string
  date: string
  /** "24 Eylül 2026 Perşembe · 1 ders" */
  label: string
  amountKurus: number
  paidKurus: number
  openKurus: number
  units: number
}

export interface ParentSummary {
  openLines: OpenLine[]
  totalOpenKurus: number
  /** Açık satırlardaki ders birimi toplamı ("Toplam · 4 ders"). */
  openUnits: number
  recentPayments: { id: string; date: string; amountKurus: number }[]
  /** Fazla ödeme (alacak). */
  creditKurus: number
  /** Uzun geçmiş: tüm tahakkuk + tahsilat, yeniden eskiye. */
  history: { id: string; date: string; label: string; amountKurus: number; payment: boolean }[]
}

const LESSON_KINDS: AccrualKind[] = ['ders', 'ek_ders']

/** Tam liraysa kuruşsuz ("1.600 ₺"), değilse kuruşlu. */
export function formatMoney(kurus: number): string {
  return kurus % 100 === 0 ? formatKurusShort(kurus) : formatKurus(kurus)
}

function accrualLabel(a: SummaryAccrual): string {
  const day = formatIsoDayDate(a.date, true)
  if (LESSON_KINDS.includes(a.kind)) {
    const units = formatUnits(a.unitCount ?? 1)
    return `${day} · ${a.kind === 'ek_ders' ? `${units} (ek)` : units}`
  }
  if (a.kind === 'aylik') return `${monthLabel(a.date.slice(0, 7))} · aylık ücret`
  return `${day} · ${ACCRUAL_KIND_LABEL[a.kind]}`
}

export function buildParentSummary(
  accruals: SummaryAccrual[],
  payments: LedgerPayment[],
  { recent = 5 }: { recent?: number } = {}
): ParentSummary {
  const { paidByAccrual, creditKurus } = allocatePayments(accruals, payments)

  const openLines = accruals
    .filter(a => a.amountKurus > 0)
    .map<OpenLine>(a => {
      const paid = paidByAccrual.get(a.id) ?? 0
      return {
        id: a.id,
        date: a.date,
        label: accrualLabel(a),
        amountKurus: a.amountKurus,
        paidKurus: paid,
        openKurus: a.amountKurus - paid,
        units: LESSON_KINDS.includes(a.kind) ? (a.unitCount ?? 1) : 0,
      }
    })
    .filter(l => l.openKurus > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  const recentPayments = [...payments]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, recent)
    .map(p => ({ id: p.id, date: p.date, amountKurus: p.amountKurus }))

  const history = [
    ...accruals
      .filter(a => a.amountKurus > 0)
      .map(a => ({ id: a.id, date: a.date, label: accrualLabel(a), amountKurus: a.amountKurus, payment: false })),
    ...payments.map(p => ({
      id: p.id,
      date: p.date,
      label: `${formatIsoDayDate(p.date, true)} · tahsilat`,
      amountKurus: p.amountKurus,
      payment: true,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))

  return {
    openLines,
    totalOpenKurus: openLines.reduce((s, l) => s + l.openKurus, 0),
    openUnits: openLines.reduce((s, l) => s + l.units, 0),
    recentPayments,
    creditKurus,
    history,
  }
}

/** Kısmi ödemede "Ödenen / Açık", değilse açık tutar. */
export function openLineAmount(line: OpenLine): string {
  return line.paidKurus > 0
    ? `Ödenen ${formatMoney(line.paidKurus)} / Açık ${formatMoney(line.openKurus)}`
    : formatMoney(line.openKurus)
}

/** Paylaşım metni — öğretmen kopyalayıp kendi gönderir (sistem göndermez). */
export function parentSummaryText(studentName: string, summary: ParentSummary, today: string): string {
  const lines = [`${studentName} · Hesap özeti (${formatIsoDayDate(today, true)})`, '']

  if (summary.openLines.length === 0) {
    lines.push('Açık tutar yok.')
  } else {
    lines.push('Açık tutar')
    for (const l of summary.openLines) lines.push(`${l.label} — ${openLineAmount(l)}`)
    const unitsPart = summary.openUnits > 0 ? ` · ${formatUnits(summary.openUnits)}` : ''
    lines.push(`Toplam${unitsPart} — ${formatMoney(summary.totalOpenKurus)}`)
  }

  if (summary.creditKurus > 0) {
    lines.push('', `Fazla ödeme (alacak): ${formatMoney(summary.creditKurus)}`)
  }

  if (summary.recentPayments.length > 0) {
    lines.push('', 'Son tahsilatlar')
    for (const p of summary.recentPayments) {
      lines.push(`${formatIsoDayDate(p.date, true)} — ${formatMoney(p.amountKurus)}`)
    }
  }

  return lines.join('\n')
}
