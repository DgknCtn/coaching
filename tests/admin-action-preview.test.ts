import { describe, it, expect } from 'vitest'
import { extendByDays, extendByMonths } from '@/lib/admin/action-preview'

const NOW = new Date('2026-09-28T12:00:00Z')

describe('yönetim işlemi önizlemesi', () => {
  it('süren denemede bitişten, bitmişte bugünden sayar', () => {
    expect(extendByDays('2026-09-30T12:00:00Z', 3, NOW).toISOString()).toBe('2026-10-03T12:00:00.000Z')
    expect(extendByDays('2026-09-01T12:00:00Z', 3, NOW).toISOString()).toBe('2026-10-01T12:00:00.000Z')
    expect(extendByDays(null, 3, NOW).toISOString()).toBe('2026-10-01T12:00:00.000Z')
  })

  it('ay eklemek ay sonunu taşırmaz (Postgres interval ile aynı)', () => {
    expect(extendByMonths('2027-01-31T00:00:00Z', 1, NOW).toISOString()).toBe('2027-02-28T00:00:00.000Z')
    expect(extendByMonths('2026-10-15T00:00:00Z', 12, NOW).toISOString()).toBe('2027-10-15T00:00:00.000Z')
    expect(extendByMonths(null, 2, NOW).toISOString()).toBe('2026-11-28T12:00:00.000Z')
  })
})
