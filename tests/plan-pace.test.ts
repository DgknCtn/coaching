import { describe, it, expect } from 'vitest'
import { calculatePlanPace } from '@/lib/plan-pace'

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
