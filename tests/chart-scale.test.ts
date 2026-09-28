import { describe, it, expect } from 'vitest'
import { compact, niceMax, percentChange, splitHalves, ticks } from '@/lib/admin/chart-scale'

describe('grafik ölçeği', () => {
  it('niceMax yuvarlak üst sınır verir, boş veride 1', () => {
    expect(niceMax(0)).toBe(1)
    expect(niceMax(-3)).toBe(1)
    expect(niceMax(NaN)).toBe(1)
    expect(niceMax(7)).toBe(10)
    expect(niceMax(18)).toBe(20)
    expect(niceMax(23)).toBe(25)
    expect(niceMax(49)).toBe(50)
    expect(niceMax(100)).toBe(100)
    expect(niceMax(101)).toBe(200)
  })

  it('ticks sıfırdan başlar', () => {
    expect(ticks(18)).toEqual([0, 10, 20])
  })

  it('compact Türkçe kısaltır', () => {
    expect(compact(1284)).toBe('1.284')
    expect(compact(12900)).toBe('12,9 B')
    expect(compact(4_200_000)).toBe('4,2 Mn')
  })

  it('percentChange önceki sıfırsa null', () => {
    expect(percentChange(5, 0)).toBeNull()
    expect(percentChange(15, 10)).toBe(50)
    expect(percentChange(5, 10)).toBe(-50)
  })

  it('splitHalves eşit pencereler', () => {
    expect(splitHalves([1, 2, 3, 4])).toEqual({ previous: 3, current: 7 })
    expect(splitHalves([1, 2, 3, 4, 5])).toEqual({ previous: 3, current: 9 })
  })
})
