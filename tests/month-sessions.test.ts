import { describe, expect, it } from 'vitest'
import { monthWeeks, weekDateRangeLabel, weekMonday } from '@/lib/iso-week'
import {
  buildMonthWeekRows,
  monthColumnsFor,
  MONTH_COLUMN_LABEL,
  type MonthServiceLike,
  type MonthSessionLike,
} from '@/lib/month-sessions'

// M1.0-05 — Ders & Görüşmeler aylık görünüm. PDF'in kendi örneği:
// "Kasım 1. Hafta | 2-8 Kas" — 1 Kasım 2026 PAZAR olduğu için ayın
// sınır haftası (26 Ekim Pzt - 1 Kasım Paz) Ekim'in son haftası
// sayılıyor, Kasım'ın ilki 2 Kasım Pazartesi'yle başlıyor.

describe('monthWeeks', () => {
  it('PDF örneği: Kasım 2026 ilk haftası 2-8 Kasım (26 Ekim haftası DAHİL DEĞİL)', () => {
    const weeks = monthWeeks('2026-11')
    expect(weekMonday(weeks[0])).toBe('2026-11-02')
    expect(weekDateRangeLabel(weeks[0])).toBe('2–8 Kasım 2026')
  })

  it('Kasım 2026 tam 5 hafta içerir (30 Kasım Pazartesi son haftayı başlatır)', () => {
    const weeks = monthWeeks('2026-11')
    expect(weeks).toHaveLength(5)
    expect(weekMonday(weeks[4])).toBe('2026-11-30')
  })

  it('her haftanın Pazartesisi istenen ayda', () => {
    const weeks = monthWeeks('2026-11')
    for (const key of weeks) {
      expect(weekMonday(key).slice(0, 7)).toBe('2026-11')
    }
  })

  it('ayın tamamı tek bir haftaya sığsa da en az 1 hafta döner', () => {
    expect(monthWeeks('2026-02').length).toBeGreaterThan(0)
  })
})

describe('monthColumnsFor', () => {
  it('yalnız birebir ders varsa tek sütun', () => {
    const services: MonthServiceLike[] = [{ contactKind: 'birebir_ders' }]
    expect(monthColumnsFor(services)).toEqual(['birebir_ders'])
  })

  it('birebir ders + koçluk varsa iki sütun, sabit sırada', () => {
    const services: MonthServiceLike[] = [
      { contactKind: 'kocluk' },
      { contactKind: 'birebir_ders' },
    ]
    // Sıra hizmetlerin verilme sırasına değil, sabit COLUMN_ORDER'a bağlı.
    expect(monthColumnsFor(services)).toEqual(['birebir_ders', 'kocluk'])
  })

  it('hizmeti olmayan sütun hiç dönmez', () => {
    expect(monthColumnsFor([])).toEqual([])
  })

  it('MONTH_COLUMN_LABEL üç sütunun hepsini kapsar', () => {
    expect(Object.keys(MONTH_COLUMN_LABEL).sort()).toEqual(
      ['birebir_ders', 'grup_dersi', 'kocluk'].sort()
    )
  })
})

describe('buildMonthWeekRows', () => {
  const serviceById = new Map<string, MonthServiceLike>([
    ['svc-ders', { contactKind: 'birebir_ders' }],
    ['svc-kocluk', { contactKind: 'kocluk' }],
  ])

  function session(over: Partial<MonthSessionLike> & { id: string; serviceId: string; currentPlannedAt: string }): MonthSessionLike {
    return { status: 'planlandi', ...over }
  }

  it('ordinalLabel ayın kaçıncı haftası olduğunu söyler (takvim yılı hafta no DEĞİL)', () => {
    const rows = buildMonthWeekRows('2026-11', 'Kasım', [], serviceById)
    expect(rows[0].ordinalLabel).toBe('Kasım 1. Hafta')
    expect(rows[1].ordinalLabel).toBe('Kasım 2. Hafta')
    expect(rows[0].rangeLabel).toBe('2–8 Kasım 2026')
  })

  it('tek oturum varsa ordinal basılmaz', () => {
    const rows = buildMonthWeekRows(
      '2026-11',
      'Kasım',
      [session({ id: 's1', serviceId: 'svc-ders', currentPlannedAt: '2026-11-03T15:00:00.000Z' })],
      serviceById
    )
    expect(rows[0].cells.birebir_ders).toEqual([{ sessionId: 's1', ordinal: null }])
  })

  it('aynı hafta aynı sütunda 2 oturum varsa 1), 2) ile alt alta', () => {
    const rows = buildMonthWeekRows(
      '2026-11',
      'Kasım',
      [
        session({ id: 's2', serviceId: 'svc-ders', currentPlannedAt: '2026-11-05T15:00:00.000Z' }),
        session({ id: 's1', serviceId: 'svc-ders', currentPlannedAt: '2026-11-03T15:00:00.000Z' }),
      ],
      serviceById
    )
    // Kronolojik sıra: s1 önce (3 Kasım), s2 sonra (5 Kasım).
    expect(rows[0].cells.birebir_ders).toEqual([
      { sessionId: 's1', ordinal: '1)' },
      { sessionId: 's2', ordinal: '2)' },
    ])
  })

  it('farklı sütunlar birbirine karışmaz', () => {
    const rows = buildMonthWeekRows(
      '2026-11',
      'Kasım',
      [
        session({ id: 'd1', serviceId: 'svc-ders', currentPlannedAt: '2026-11-03T15:00:00.000Z' }),
        session({ id: 'k1', serviceId: 'svc-kocluk', currentPlannedAt: '2026-11-04T15:00:00.000Z' }),
      ],
      serviceById
    )
    expect(rows[0].cells.birebir_ders).toEqual([{ sessionId: 'd1', ordinal: null }])
    expect(rows[0].cells.kocluk).toEqual([{ sessionId: 'k1', ordinal: null }])
  })

  it('iptal edilen oturum hiçbir hücrede görünmez', () => {
    const rows = buildMonthWeekRows(
      '2026-11',
      'Kasım',
      [session({ id: 'c1', serviceId: 'svc-ders', currentPlannedAt: '2026-11-03T15:00:00.000Z', status: 'iptal' })],
      serviceById
    )
    expect(rows[0].cells.birebir_ders).toEqual([])
  })

  it('bilinmeyen hizmete ait oturum sessizce atlanır', () => {
    const rows = buildMonthWeekRows(
      '2026-11',
      'Kasım',
      [session({ id: 'x1', serviceId: 'silinmis-hizmet', currentPlannedAt: '2026-11-03T15:00:00.000Z' })],
      serviceById
    )
    expect(rows.every(r => Object.values(r.cells).every(c => c.length === 0))).toBe(true)
  })
})
