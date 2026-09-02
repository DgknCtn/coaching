import { describe, expect, it } from 'vitest'
import {
  formatTempo,
  formatUnitCount,
  formatUnitProgress,
  perWeekLabel,
  unitLabel,
} from '@/lib/unit-labels'

// R6-01 kabul testleri. Sayılar dokümandaki gerçek MÖF kaydından alındı:
// 614 sayfa, 40,9 sayfa/hafta, 71 sayfalık haftalık plan.

describe('unitLabel', () => {
  it('sayfa takipli kitapta "sayfa" der', () => {
    expect(unitLabel('page')).toBe('sayfa')
  })

  it('test takipli kitapta "test" der', () => {
    expect(unitLabel('test')).toBe('test')
  })

  it('takip türü bilinmiyorsa test kabul eder (013 DB default)', () => {
    expect(unitLabel(null)).toBe('test')
    expect(unitLabel(undefined)).toBe('test')
  })

  // R7-02 §6.5: takip türü beşe çıktı. Yapı aynı kaldı (her birim yine bir
  // book_tests satırı); değişen yalnız birimin adı.
  it('R7: bölüm / adım / deneme türlerinin birim adını üretir', () => {
    expect(unitLabel('section')).toBe('bölüm')
    expect(unitLabel('step')).toBe('adım')
    expect(unitLabel('trial')).toBe('deneme')
  })

  it('R7: tanınmayan bir tür yine test kabul edilir', () => {
    expect(unitLabel('bilinmeyen')).toBe('test')
  })
})

describe('perWeekLabel', () => {
  it('sayfa/hafta ve test/hafta üretir', () => {
    expect(perWeekLabel('page')).toBe('sayfa/hafta')
    expect(perWeekLabel('test')).toBe('test/hafta')
  })

  it('R7: yeni türlerde de aynı kalıbı kullanır', () => {
    expect(perWeekLabel('trial')).toBe('deneme/hafta')
    expect(perWeekLabel('step')).toBe('adım/hafta')
  })
})

describe('formatUnitCount', () => {
  it('kabul #1: sayfa bazlı MÖF üst kartı 614 sayfa gösterir', () => {
    expect(formatUnitCount(614, 'page')).toBe('614 sayfa')
  })

  it('kabul #6: test bazlı kaynakta davranış değişmez', () => {
    expect(formatUnitCount(176, 'test')).toBe('176 test')
  })
})

describe('formatUnitProgress', () => {
  it('kabul #4: ödev kartı 0/71 sayfa gösterir', () => {
    expect(formatUnitProgress(0, 71, 'page')).toBe('0/71 sayfa')
  })

  it('test kaynağında 0/71 test gösterir', () => {
    expect(formatUnitProgress(0, 71, 'test')).toBe('0/71 test')
  })
})

describe('formatTempo', () => {
  it('kabul #2: tempo 40,9 sayfa/hafta görünür', () => {
    expect(formatTempo(40.9, 'page')).toBe('40,9 sayfa/hafta')
  })

  it('test kaynağında test/hafta korunur', () => {
    expect(formatTempo(4.7, 'test')).toBe('4,7 test/hafta')
  })

  it('değer yoksa em-dash döner', () => {
    expect(formatTempo(null, 'page')).toBe('—')
  })
})
