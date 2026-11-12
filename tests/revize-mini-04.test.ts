import { describe, it, expect } from 'vitest'
import { periodSummary, type LedgerAccrual, type LedgerPayment } from '@/lib/finance-ledger'

// Revize Mini 04 (12.11.2026): ödeme sonrası önceki dönem "açık" uyarısı.

const acc = (id: string, date: string, amountKurus: number): LedgerAccrual => ({
  id,
  date,
  amountKurus,
  kind: 'ders',
})
const pay = (id: string, date: string, amountKurus: number): LedgerPayment => ({ id, date, amountKurus })

describe('Mini 04 · önceki dönemden kalan GÜNCEL açık', () => {
  // Elif: önceki dönemden 4.000 + Kasım 4.000; Kasım'da 8.000 tahsilat.
  const accruals = [acc('eki', '2026-10-20', 400_000), acc('kas', '2026-11-03', 400_000)]

  it('tamamen ödendiyse üst uyarı yok; alttaki tarihsel değerler aynen', () => {
    const nov = periodSummary(accruals, [pay('p', '2026-11-10', 800_000)], '2026-11')
    expect(nov.previousOpenKurus).toBe(0)
    expect(nov.carriedInKurus).toBe(400_000) // "Dönem başı devreden bakiye" — tarihsel
    expect(nov.periodAccruedKurus).toBe(400_000)
    expect(nov.periodCollectedKurus).toBe(800_000)
    expect(nov.currentBalanceKurus).toBe(0)
  })

  it('kısmi ödeme: üstte yalnız kalan 2.000, devir yine 4.000', () => {
    const nov = periodSummary(accruals, [pay('p', '2026-11-10', 200_000)], '2026-11')
    expect(nov.previousOpenKurus).toBe(200_000)
    expect(nov.carriedInKurus).toBe(400_000)
  })

  it('ödeme kaydı tek başına satırı gizlemez — kalan varsa görünür', () => {
    const nov = periodSummary(accruals, [pay('p', '2026-11-10', 100)], '2026-11')
    expect(nov.previousOpenKurus).toBe(399_900)
  })

  it('aylar arası geçişte tutarlı: Aralık\'ta önceki dönemlerin tamamı kapalı', () => {
    const p = [pay('p', '2026-11-10', 800_000)]
    expect(periodSummary(accruals, p, '2026-12').previousOpenKurus).toBe(0)
    expect(periodSummary(accruals, p, '2026-11').previousOpenKurus).toBe(0)
  })
})
