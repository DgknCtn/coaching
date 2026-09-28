import { describe, it, expect } from 'vitest'
import { dayLabel, formatBytes, monthLabel } from '@/lib/admin/types'
import { parseWindow } from '@/components/admin/window-picker'

describe('yönetim biçimleri', () => {
  it('gün ve ay etiketi saat diliminden bağımsız', () => {
    expect(dayLabel('2026-09-27')).toBe('27 Eyl')
    expect(monthLabel('2026-09')).toMatch(/^Eyl.*26$/)
    expect(monthLabel('2026-01')).toMatch(/^Oca/)
  })

  it('formatBytes', () => {
    expect(formatBytes(35_318_931)).toBe('34 MB')
    expect(formatBytes(2048)).toBe('2 kB')
  })

  it('parseWindow bilinmeyen değeri varsayılana düşürür; seçenek listesi verilebilir', () => {
    expect(parseWindow('90')).toBe(90)
    expect(parseWindow('45')).toBe(30)
    expect(parseWindow(undefined, 7)).toBe(7)
    expect(parseWindow('24', 12, [6, 12, 24])).toBe(24)
    expect(parseWindow('30', 12, [6, 12, 24])).toBe(12)
  })
})
