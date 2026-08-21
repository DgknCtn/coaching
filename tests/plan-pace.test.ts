import { describe, it, expect } from 'vitest'
import { calculatePlanPace, calculatePlanTempo } from '@/lib/plan-pace'

describe('calculatePlanPace', () => {
  it('returns no_target when there is no target end date', () => {
    const r = calculatePlanPace({ startDate: '2025-01-01', targetEndDate: null, totalUnits: 10, completedUnits: 0 })
    expect(r.phraseKey).toBe('no_target')
    expect(r.delta).toBe(0)
  })

  it('returns not_started when today is before the start date', () => {
    const today = new Date('2025-01-01')
    const r = calculatePlanPace({
      startDate: '2025-02-01', targetEndDate: '2025-03-01', totalUnits: 10, completedUnits: 0, today,
    })
    expect(r.phraseKey).toBe('not_started')
  })

  it('returns ahead with a positive delta phrase when completed exceeds expected pace', () => {
    // 50% elapsed, 10 total -> expected 5; completed 9 -> +4 ahead
    const today = new Date('2025-01-16')
    const r = calculatePlanPace({
      startDate: '2025-01-01', targetEndDate: '2025-01-31', totalUnits: 10, completedUnits: 9, today,
    })
    expect(r.phraseKey).toBe('ahead')
    expect(r.delta).toBeGreaterThan(0)
    expect(r.phrase).toContain('önündesin')
    expect(r.phrase).not.toMatch(/kötü|yetersiz|geri kaldın/i)
  })

  it('returns behind with a neutral (non-judgmental) phrase when completed trails expected pace', () => {
    const today = new Date('2025-01-16')
    const r = calculatePlanPace({
      startDate: '2025-01-01', targetEndDate: '2025-01-31', totalUnits: 10, completedUnits: 1, today,
    })
    expect(r.phraseKey).toBe('behind')
    expect(r.delta).toBeLessThan(0)
    expect(r.phrase).toContain('gerisindesin')
    expect(r.phrase).not.toMatch(/kötü|yetersiz|başarısız/i)
  })

  it('returns on_track when completed matches expected pace exactly', () => {
    const today = new Date('2025-01-16')
    const r = calculatePlanPace({
      startDate: '2025-01-01', targetEndDate: '2025-01-31', totalUnits: 10, completedUnits: 5, today,
    })
    expect(r.phraseKey).toBe('on_track')
    expect(r.delta).toBe(0)
  })

  it('clamps elapsed fraction after the target date (does not exceed totalUnits expectation)', () => {
    const today = new Date('2025-06-01')
    const r = calculatePlanPace({
      startDate: '2025-01-01', targetEndDate: '2025-01-31', totalUnits: 10, completedUnits: 10, today,
    })
    expect(r.expectedCompletedUnits).toBe(10)
    expect(r.phraseKey).toBe('on_track')
  })
})

describe('calculatePlanTempo', () => {
  it('reproduces the worked example from the R3 v2 brief', () => {
    // 01.09.2025 → 01.05.2026, 165 test, 41 tamamlanan, bugün ~20 hafta kala.
    const r = calculatePlanTempo({
      startDate: '2025-09-01',
      targetEndDate: '2026-05-01',
      totalUnits: 165,
      completedUnits: 41,
      today: new Date('2025-12-12'), // hedefe tam 20 hafta
    })
    expect(r.remainingUnits).toBe(124)
    expect(r.completionPercentage).toBe(25)
    expect(r.totalWeeks).toBe(35)
    expect(r.remainingWeeks).toBe(20)
    expect(r.initialPacePerWeek).toBeCloseTo(4.7, 1)
    expect(r.requiredPacePerWeek).toBeCloseTo(6.2, 1)
  })

  it('never divides by zero when the target date has passed', () => {
    const r = calculatePlanTempo({
      startDate: '2025-09-01',
      targetEndDate: '2025-10-01',
      totalUnits: 100,
      completedUnits: 60,
      today: new Date('2025-12-01'),
    })
    expect(r.isTargetReached).toBe(true)
    expect(r.remainingWeeks).toBe(0)
    // Kalan işin tamamı bu haftaya kalmıştır — Infinity/NaN değil.
    expect(r.requiredPacePerWeek).toBe(40)
    expect(Number.isFinite(r.requiredPacePerWeek!)).toBe(true)
  })

  it('returns null pace figures when there is no target date', () => {
    const r = calculatePlanTempo({
      startDate: '2025-09-01', targetEndDate: null, totalUnits: 50, completedUnits: 10,
    })
    expect(r.totalWeeks).toBeNull()
    expect(r.requiredPacePerWeek).toBeNull()
    expect(r.remainingUnits).toBe(40)
  })

  it('still reports remaining weeks when the start date is unknown', () => {
    const r = calculatePlanTempo({
      startDate: null,
      targetEndDate: '2026-05-01',
      totalUnits: 80,
      completedUnits: 20,
      today: new Date('2026-03-01'),
    })
    expect(r.totalWeeks).toBeNull()
    expect(r.initialPacePerWeek).toBeNull()
    expect(r.remainingWeeks).toBeGreaterThan(0)
    expect(r.requiredPacePerWeek).toBeGreaterThan(0)
  })

  it('handles a book with no tests without producing NaN', () => {
    const r = calculatePlanTempo({
      startDate: '2026-01-01', targetEndDate: '2026-06-01', totalUnits: 0, completedUnits: 0,
      today: new Date('2026-03-01'),
    })
    expect(r.completionPercentage).toBe(0)
    expect(r.requiredPacePerWeek).toBe(0)
  })
})
