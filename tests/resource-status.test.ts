import { describe, it, expect } from 'vitest'
import {
  PLAN_DEVIATION_THRESHOLDS,
  planDeviationLabel,
  resolvePlanDeviation,
  type PlanDeviationInput,
} from '@/lib/resource-status'

// R7 Kaynak Mimarisi, Ek sayfa: "Kaynak Planı Durum Sözlüğü".
// Belgedeki üç örnek, beş eşik ve dört özel durum burada birebir
// sabitlenir — sözlüğün anlamı bu dosyadan kayarsa test kırılmalı.

function input(over: Partial<PlanDeviationInput> = {}): PlanDeviationInput {
  return {
    status: 'active',
    plannedPacePerWeek: 10,
    requiredPacePerWeek: 10,
    remainingUnits: 100,
    isTargetReached: false,
    startDate: '2026-01-01',
    today: new Date('2026-06-01'),
    ...over,
  }
}

describe('resolvePlanDeviation — belgedeki örnekler', () => {
  it('6,1 -> 6,9 çalışma/hafta: R = 1,13 ise Planla uyumlu', () => {
    const r = resolvePlanDeviation(
      input({ plannedPacePerWeek: 6.1, requiredPacePerWeek: 6.9 })
    )
    expect(r.key).toBe('on_track')
    expect(r.label).toBe('Planla uyumlu')
    expect(r.ratio).toBeCloseTo(1.13, 2)
    expect(r.deviationPercentage).toBe(13)
  })

  it('15,0 -> 22,5: R = 1,50 ise Belirgin geride', () => {
    const r = resolvePlanDeviation(
      input({ plannedPacePerWeek: 15, requiredPacePerWeek: 22.5 })
    )
    expect(r.key).toBe('clearly_behind')
    expect(r.label).toBe('Belirgin geride')
    expect(r.deviationPercentage).toBe(50)
  })

  it('15,0 -> 24,0: R = 1,60 ise Hedef tarihi riskli', () => {
    const r = resolvePlanDeviation(
      input({ plannedPacePerWeek: 15, requiredPacePerWeek: 24 })
    )
    expect(r.key).toBe('target_at_risk')
    expect(r.deviationPercentage).toBe(60)
  })

  it('gerekli tempo planlananın belirgin altındaysa Planın ilerisinde', () => {
    const r = resolvePlanDeviation(
      input({ plannedPacePerWeek: 10, requiredPacePerWeek: 8 })
    )
    expect(r.key).toBe('ahead')
    expect(r.deviationPercentage).toBe(-20)
  })
})

describe('resolvePlanDeviation — eşik sınırları', () => {
  const t = PLAN_DEVIATION_THRESHOLDS

  // Bant sınırları belgede kapalı/açık olarak ayrı ayrı tanımlı:
  //   R < 0,85 · 0,85 <= R <= 1,15 · 1,15 < R < 1,30 · 1,30 <= R < 1,60
  const cases: [number, string][] = [
    [t.ahead - 0.001, 'ahead'],
    [t.ahead, 'on_track'],
    [t.onTrack, 'on_track'],
    [t.onTrack + 0.001, 'slightly_behind'],
    [t.slightlyBehind - 0.001, 'slightly_behind'],
    [t.slightlyBehind, 'clearly_behind'],
    [t.clearlyBehind - 0.001, 'clearly_behind'],
    [t.clearlyBehind, 'target_at_risk'],
  ]

  for (const [ratio, expected] of cases) {
    it(`R = ${ratio} -> ${expected}`, () => {
      const r = resolvePlanDeviation(
        input({ plannedPacePerWeek: 100, requiredPacePerWeek: 100 * ratio })
      )
      expect(r.key).toBe(expected)
    })
  }
})

describe('resolvePlanDeviation — özel durumlar (Ek §4)', () => {
  it('kalan hedef kapsam 0 ise oran hesaplanmaz, Hedef Tamamlandı döner', () => {
    const r = resolvePlanDeviation(
      input({ remainingUnits: 0, plannedPacePerWeek: 10, requiredPacePerWeek: 40 })
    )
    expect(r.key).toBe('target_completed')
    expect(r.ratio).toBeNull()
  })

  it('Bekliyor durumundaki kaynakta plan durumu üretilmez', () => {
    expect(resolvePlanDeviation(input({ status: 'pending' })).key).toBe('not_evaluated')
    // paused, sözlükte Bekliyor'a indirgenir (lib/resource-plan.ts).
    expect(resolvePlanDeviation(input({ status: 'paused' })).key).toBe('not_evaluated')
  })

  it('başlangıç tarihi gelmemişse plan durumu üretilmez', () => {
    const r = resolvePlanDeviation(
      input({ startDate: '2026-09-01', today: new Date('2026-06-01') })
    )
    expect(r.key).toBe('not_evaluated')
  })

  it('hedef tarihi geçmiş ve kalan iş varsa doğrudan Hedef tarihi riskli', () => {
    const r = resolvePlanDeviation(input({ isTargetReached: true, remainingUnits: 12 }))
    expect(r.key).toBe('target_at_risk')
  })

  it('tempo hesaplanamıyorsa (tarih yok) durum üretilmez', () => {
    expect(
      resolvePlanDeviation(input({ plannedPacePerWeek: null })).key
    ).toBe('not_evaluated')
    expect(
      resolvePlanDeviation(input({ requiredPacePerWeek: null })).key
    ).toBe('not_evaluated')
    // Sıfır planlanan tempo bölme hatası üretmemeli.
    expect(
      resolvePlanDeviation(input({ plannedPacePerWeek: 0 })).key
    ).toBe('not_evaluated')
  })
})

describe('durum sözlüğü', () => {
  it('yalnız belgedeki beş etiket + tamamlandı/nötr karşılıkları vardır', () => {
    expect(planDeviationLabel('ahead')).toBe('Planın ilerisinde')
    expect(planDeviationLabel('on_track')).toBe('Planla uyumlu')
    expect(planDeviationLabel('slightly_behind')).toBe('Hafif geride')
    expect(planDeviationLabel('clearly_behind')).toBe('Belirgin geride')
    expect(planDeviationLabel('target_at_risk')).toBe('Hedef tarihi riskli')
  })

  it('"tempo artmalı" ifadeleri sözlükten çıkarılmıştır', () => {
    const labels = (
      [
        'ahead',
        'on_track',
        'slightly_behind',
        'clearly_behind',
        'target_at_risk',
        'target_completed',
        'not_evaluated',
      ] as const
    ).map(planDeviationLabel)

    for (const label of labels) {
      expect(label).not.toMatch(/tempo/i)
      expect(label).not.toMatch(/artmalı/i)
    }
  })
})
