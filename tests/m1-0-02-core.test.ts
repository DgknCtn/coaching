import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  isoWeekKey,
  isoWeekKeyOfDate,
  isValidWeekKey,
  shiftWeek,
  weekDays,
  weekLabel,
  weekMonday,
  weekMonths,
  weekRange,
} from '@/lib/iso-week'
import {
  accrualAmount,
  accrualPriceType,
  modelAt,
  priceAt,
  priceHistory,
  type PriceVersion,
} from '@/lib/pricing-history'
import {
  allocatePayments,
  balanceState,
  currentBalance,
  periodSummary,
  shiftMonth,
  type LedgerAccrual,
  type LedgerPayment,
} from '@/lib/finance-ledger'
import { deriveMakeupStatus, formatUnits, sessionDisplayStatus } from '@/lib/session-state'
import {
  deriveMainContact,
  formatServiceSchedule,
  occurrencesInMonth,
  type ServiceLike,
} from '@/lib/service-structure'

// ============================================================
// M1.0-02 (10 Ekim 2026) — Hizmet Yapısı + Ders & Görüşmeler + Finans V1
//
// Dokümanın §12 kabul senaryoları ve görseldeki gerçek "Ömer Ders" notu
// burada saf fonksiyonlarla; aynı senaryolar SQL tarafında 139-141'in
// üzerinde PGlite ile de koşturuldu (bkz. commit mesajı).
// ============================================================

const DIR = join(process.cwd(), 'supabase/migrations')
const SQL_139 = readFileSync(join(DIR, '139_service_cadence_and_pricing.sql'), 'utf8')
const SQL_140 = readFileSync(join(DIR, '140_session_plan_vs_outcome.sql'), 'utf8')
const SQL_141 = readFileSync(join(DIR, '141_finance_v1.sql'), 'utf8')

function block(sql: string, label: string): string {
  const m = sql.match(new RegExp(`PARITY-BEGIN ${label}([\\s\\S]*?)PARITY-END ${label}`))
  if (!m) throw new Error(`PARITY ${label} bulunamadı`)
  return m[1]
}

describe('ISO hafta', () => {
  it('dokümandaki örnek: 41. Hafta · 5–11 Ekim 2026', () => {
    expect(isoWeekKeyOfDate('2026-10-05')).toBe('2026-W41')
    expect(isoWeekKeyOfDate('2026-10-11')).toBe('2026-W41')
    expect(weekLabel('2026-W41')).toBe('41. Hafta · 5–11 Ekim 2026')
    expect(weekMonday('2026-W41')).toBe('2026-10-05')
  })

  it('ay ve yıl sınırı', () => {
    expect(weekLabel('2026-W40')).toBe('40. Hafta · 28 Eylül – 4 Ekim 2026')
    // 1 Ocak 2026 Perşembe → 29 Aralık 2025 haftası 2026-W01.
    expect(isoWeekKeyOfDate('2025-12-29')).toBe('2026-W01')
    expect(weekLabel('2026-W01')).toBe('1. Hafta · 29 Aralık 2025 – 4 Ocak 2026')
    expect(weekMonths('2026-W40')).toEqual(['2026-09', '2026-10'])
  })

  it('Pazar gecesi Istanbul saatiyle aynı haftada kalır', () => {
    // 11 Ekim 2026 Pazar 23:30 İstanbul = 20:30 UTC.
    expect(isoWeekKey(new Date('2026-10-11T20:30:00Z'))).toBe('2026-W41')
    // 12 Ekim 00:30 İstanbul = 11 Ekim 21:30 UTC → yeni hafta.
    expect(isoWeekKey(new Date('2026-10-11T21:30:00Z'))).toBe('2026-W42')
  })

  it('aralık Istanbul gece yarısından gece yarısına', () => {
    const { from, to } = weekRange('2026-W41')
    expect(from.toISOString()).toBe('2026-10-04T21:00:00.000Z')
    expect(to.toISOString()).toBe('2026-10-11T21:00:00.000Z')
    expect(weekDays('2026-W41')).toHaveLength(7)
  })

  it('kaydırma ve doğrulama', () => {
    expect(shiftWeek('2026-W41', 1)).toBe('2026-W42')
    expect(shiftWeek('2026-W01', -1)).toBe('2025-W52')
    expect(isValidWeekKey('2026-W41')).toBe(true)
    expect(isValidWeekKey('2026-W53')).toBe(true) // 2026 53 haftalık
    expect(isValidWeekKey('2025-W53')).toBe(false)
    expect(isValidWeekKey('2026-41')).toBe(false)
  })
})

describe('tarihsel fiyat (§3 "Fiyat değişikliği")', () => {
  const versions: PriceVersion[] = [
    { priceType: 'aylik', amountKurus: 1_250_000, validFrom: '2026-10-01' },
    { priceType: 'aylik', amountKurus: 1_400_000, validFrom: '2027-01-01' },
    { priceType: 'ek_ders', amountKurus: 175_000, validFrom: '2026-10-01' },
    { priceType: 'ek_ders', amountKurus: 200_000, validFrom: '2027-02-01' },
  ]

  it('geçmiş dönem eski fiyatla kalır', () => {
    expect(priceAt(versions, 'aylik', '2026-12-31')).toBe(1_250_000)
    expect(priceAt(versions, 'aylik', '2027-01-01')).toBe(1_400_000)
    expect(priceAt(versions, 'ek_ders', '2027-01-15')).toBe(175_000)
    expect(priceAt(versions, 'ek_ders', '2027-02-01')).toBe(200_000)
  })

  it('fiyat yoksa null — sıfır TL değil', () => {
    expect(priceAt(versions, 'aylik', '2026-09-30')).toBeNull()
    expect(priceAt(versions, 'ders_basi', '2027-01-01')).toBeNull()
  })

  it('geçmiş listesi yeniden eskiye, bitiş tarihiyle', () => {
    const h = priceHistory(versions, 'aylik')
    expect(h.map((v) => [v.validFrom, v.validTo])).toEqual([
      ['2027-01-01', null],
      ['2026-10-01', '2026-12-31'],
    ])
  })

  it('model de tarihsel okunur', () => {
    const models = [
      { model: 'ders_basi' as const, collectionTiming: 'ay_sonu' as const, validFrom: '2026-03-01' },
      { model: 'aylik_sabit' as const, collectionTiming: 'ay_basi' as const, validFrom: '2026-10-01' },
    ]
    expect(modelAt(models, '2026-09-30')?.model).toBe('ders_basi')
    expect(modelAt(models, '2026-10-01')?.model).toBe('aylik_sabit')
    expect(modelAt(models, '2026-02-28')).toBeNull()
  })

  it('SQL price_at aynı kuralı kullanıyor (tarih dahil, en son sürüm)', () => {
    const sql = block(SQL_139, 'price_at').replace(/\s+/g, ' ')
    expect(sql).toMatch(/v\.valid_from <= p_date/)
    expect(sql).toMatch(/ORDER BY v\.valid_from DESC, v\.created_at DESC/)
    expect(sql).toMatch(/LIMIT 1/)
  })
})

describe('Yapıldı olayının finans etkisi (§10)', () => {
  it('Modele dahil: aylık sabitte ücret yok, ek ders ücretli', () => {
    expect(accrualPriceType('aylik_paket', 'aylik_sabit', false)).toBeNull()
    expect(accrualPriceType('aylik_paket', 'aylik_sabit', true)).toBe('ek_ders')
  })
  it('Modele dahil: ders başında birim × ders başı fiyatı', () => {
    expect(accrualPriceType('aylik_paket', 'ders_basi', false)).toBe('ders_basi')
    expect(accrualPriceType('aylik_paket', null, false)).toBeNull()
  })
  it('Oturum başı her zaman ücretlenir; Takip dışı hiç', () => {
    expect(accrualPriceType('ders_basi', 'aylik_sabit', false)).toBe('ek_ders')
    expect(accrualPriceType('ders_basi', 'ders_basi', false)).toBe('ders_basi')
    expect(accrualPriceType('ders_basi', null, false)).toBe('ders_basi')
    expect(accrualPriceType('haric', 'ders_basi', true)).toBeNull()
  })
  it('tutar birimden, süreden değil', () => {
    expect(accrualAmount(250_000, 1.5)).toBe(375_000)
    // 2 saatlik ders = 1 birim = 4.000 TL (Ömer)
    expect(accrualAmount(400_000, 1)).toBe(400_000)
  })
  it('SQL kuralı TS aynasıyla aynı dallara sahip; dakika çarpanı yok', () => {
    const rule = block(SQL_141, 'accrual_rule')
    expect(rule).toMatch(/finance_link = 'aylik_paket'/)
    expect(rule).toMatch(/v_model = 'aylik_sabit' AND v_ss\.is_extra/)
    const fn = SQL_141.slice(SQL_141.indexOf('FUNCTION public.sync_session_accrual'))
    const body = fn.slice(0, fn.indexOf('$fn$;'))
    expect(body).not.toMatch(/\/ 60/)
    expect(body).toMatch(/v_rate::NUMERIC \* v_units/)
  })
})

function acc(id: string, date: string, amount: number, kind: LedgerAccrual['kind'] = 'ders'): LedgerAccrual {
  return { id, date, amountKurus: amount, kind }
}
function pay(id: string, date: string, amount: number, appliesToMonth?: string): LedgerPayment {
  return { id, date, amountKurus: amount, appliesToMonth }
}

describe('öğrenci cari hesabı', () => {
  it('Senaryo A — aylık sabit + ek ders: dönem 14.250, kalan 1.750', () => {
    const a = [acc('m', '2026-10-01', 1_250_000, 'aylik'), acc('e', '2026-10-08', 175_000, 'ek_ders')]
    const p = [pay('p', '2026-10-02', 1_250_000)]
    const s = periodSummary(a, p, '2026-10')
    expect(s.periodAccruedKurus).toBe(1_425_000)
    expect(s.periodCollectedKurus).toBe(1_250_000)
    expect(s.closingBalanceKurus).toBe(175_000)
    expect(s.state).toBe('kismi')
  })

  it('Senaryo B — 2 + 1,5 + 2 birim × 2.500 = 13.750; kalan 3.750; devreden yaşar, Ekim toplamı değişmez', () => {
    const a = [
      acc('1', '2026-10-03', accrualAmount(250_000, 2)),
      acc('2', '2026-10-10', accrualAmount(250_000, 1.5)),
      acc('3', '2026-10-17', accrualAmount(250_000, 2)),
    ]
    const p = [pay('p', '2026-10-20', 1_000_000)]
    const oct = periodSummary(a, p, '2026-10')
    expect(oct.periodAccruedKurus).toBe(1_375_000)
    expect(oct.closingBalanceKurus).toBe(375_000)

    const nov = periodSummary([...a, acc('4', '2026-11-07', 500_000)], p, '2026-11')
    expect(nov.carriedInKurus).toBe(375_000)
    expect(nov.periodAccruedKurus).toBe(500_000)
    // Ekim geçmişte aynı kalır.
    expect(periodSummary([...a, acc('4', '2026-11-07', 500_000)], p, '2026-10').periodAccruedKurus).toBe(1_375_000)
  })

  it('§7 devreden örneği: 2.000 + 12.500 = 14.500', () => {
    const a = [acc('eyl', '2026-09-01', 1_250_000, 'aylik'), acc('eki', '2026-10-01', 1_250_000, 'aylik')]
    const p = [pay('p', '2026-09-05', 1_050_000)]
    const oct = periodSummary(a, p, '2026-10')
    expect(oct.carriedInKurus).toBe(200_000)
    expect(oct.closingBalanceKurus).toBe(1_450_000)
    expect(periodSummary(a, p, '2026-09').periodAccruedKurus).toBe(1_250_000)
  })

  it('Ömer (görseldeki not): devir 3.800 + 10 × 4.000 = 43.800; 44.000 tahsil → 200 TL alacak', () => {
    const dates = ['2026-03-17', '2026-03-29', '2026-04-12', '2026-04-23', '2026-04-27',
      '2026-05-10', '2026-05-17', '2026-05-26', '2026-06-06', '2026-06-28']
    const a = [acc('devir', '2026-03-08', 380_000, 'devir'), ...dates.map((d, i) => acc(`d${i}`, d, 400_000))]
    const p = [pay('p', '2026-07-07', 4_400_000)]
    expect(currentBalance(a, [])).toBe(4_380_000)
    expect(currentBalance(a, p)).toBe(-20_000)

    const alloc = allocatePayments(a, p)
    expect(alloc.creditKurus).toBe(20_000)
    expect([...alloc.paidByAccrual.values()].every((v, i) => v === a[i].amountKurus)).toBe(true)

    const jul = periodSummary(a, p, '2026-07')
    expect(jul.carriedInKurus).toBe(4_380_000)
    expect(jul.closingBalanceKurus).toBe(-20_000)
    expect(jul.state).toBe('alacak')
  })

  it('FIFO: en eski açık alacak önce kapanır; döneme uygulanan önce o dönemi kapatır', () => {
    const a = [acc('eyl', '2026-09-01', 100), acc('eki', '2026-10-01', 100)]
    expect(allocatePayments(a, [pay('p', '2026-10-05', 100)]).paidByAccrual.get('eyl')).toBe(100)
    const pinned = allocatePayments(a, [pay('p', '2026-10-05', 100, '2026-10-01')])
    expect(pinned.paidByAccrual.get('eki')).toBe(100)
    expect(pinned.paidByAccrual.get('eyl')).toBe(0)
  })

  it('fazla ödeme sonraki tahakkuku kapatır', () => {
    const a = [acc('1', '2026-07-01', 100), acc('2', '2026-08-01', 50)]
    const r = allocatePayments(a, [pay('p', '2026-07-02', 120)])
    expect(r.paidByAccrual.get('2')).toBe(20)
    expect(r.creditKurus).toBe(0)
  })

  it('durum eşikleri', () => {
    expect(balanceState(0, 0, 0)).toBe('yok')
    expect(balanceState(0, 100, 100)).toBe('odendi')
    expect(balanceState(100, 100, 0)).toBe('bekliyor')
    expect(balanceState(-5, 100, 105)).toBe('alacak')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })
})

describe('telafi durum makinesi (§5)', () => {
  const base = { isMakeup: false, makeupDecision: null as 'pending' | 'waived' | null }
  it('Planlandı → Yapılmadı → karar bekliyor → planlandı → tamamlandı', () => {
    expect(deriveMakeupStatus({ ...base, status: 'planlandi', childStatuses: [] })).toBe('none')
    expect(deriveMakeupStatus({ ...base, status: 'yapilmadi', childStatuses: [] })).toBe('decision_pending')
    expect(deriveMakeupStatus({ ...base, status: 'yapilmadi', childStatuses: ['planlandi'] })).toBe('planned')
    expect(deriveMakeupStatus({ ...base, status: 'yapilmadi', childStatuses: ['yapildi'] })).toBe('completed')
  })
  it('telafi edilmeyecek; başarısız telafi yeniden karar bekletir', () => {
    expect(deriveMakeupStatus({ ...base, status: 'yapilmadi', makeupDecision: 'waived', childStatuses: [] })).toBe('not_required')
    expect(deriveMakeupStatus({ ...base, status: 'yapilmadi', childStatuses: ['iptal'] })).toBe('decision_pending')
    expect(deriveMakeupStatus({ ...base, isMakeup: true, status: 'yapilmadi', childStatuses: [] })).toBe('none')
  })
  it('SQL tetikleyicisi aynı sırayı izliyor', () => {
    const sql = block(SQL_140, 'makeup_status')
    const order = ["'none'", "'completed'", "'planned'", "'not_required'", "'decision_pending'"]
      .map((t) => sql.indexOf(t))
    expect(order.every((v) => v >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
  it('ekran metni', () => {
    expect(sessionDisplayStatus({ status: 'yapilmadi', makeupStatus: 'decision_pending', isMakeup: false }).label)
      .toBe('Telafi kararı bekliyor')
    expect(sessionDisplayStatus({ status: 'planlandi', makeupStatus: 'none', isMakeup: true }).label)
      .toBe('Telafi planlandı')
    expect(formatUnits(1.5)).toBe('1,5 ders')
    expect(formatUnits(2)).toBe('2 ders')
    // M1.0-05: Koçluk kullanıcı dilinde "görüşme" — iç 0,5/1/1,5/2 birim
    // altyapısına dokunulmuyor, yalnız gösterim kelimesi değişiyor.
    expect(formatUnits(1, 'kocluk')).toBe('1 görüşme')
    expect(formatUnits(1.5, 'kocluk')).toBe('1,5 görüşme')
    expect(formatUnits(1, 'ders')).toBe('1 ders')
  })
})

describe('hizmet ritmi', () => {
  const svc: ServiceLike = {
    id: 's', kind: 'kocluk', participation: 'birebir', medium: 'online',
    weekday: 2, startTime: '20:00', plannedDurationMinutes: 30, startDate: '2026-11-01', status: 'active',
  }
  it('haftada 2 iki slot üretir (Kasım 2026: 4 Salı + 4 Cuma)', () => {
    const out = occurrencesInMonth({ ...svc, cadence: 'haftada_2', weekday2: 5, startTime2: '21:00' }, 2026, 11)
    expect(out).toHaveLength(8)
    expect(out.map((d) => d.getTime())).toEqual([...out.map((d) => d.getTime())].sort((a, b) => a - b))
  })
  it('esnek takvim üretmez', () => {
    expect(occurrencesInMonth({ ...svc, cadence: 'esnek' }, 2026, 11)).toEqual([])
    expect(formatServiceSchedule({ ...svc, cadence: 'esnek' })).toBe('Esnek · 30 dk')
  })
  it('SQL üretimi de esnek ritmi dışarıda bırakıyor', () => {
    const gen = SQL_140.slice(SQL_140.indexOf('FUNCTION public.generate_service_sessions'))
    expect(gen.slice(0, gen.indexOf('$fn$;'))).toMatch(/s\.cadence <> 'esnek'/)
  })
  it('elle seçilmiş ana temas otomatik önceliği ezer', () => {
    const ders: ServiceLike = { ...svc, id: 'd', kind: 'ders', weekday: 1 }
    expect(deriveMainContact([svc, ders])?.id).toBe('s')
    expect(deriveMainContact([svc, { ...ders, isMainContact: true }])?.id).toBe('d')
  })
})
