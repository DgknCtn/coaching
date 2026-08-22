import { describe, it, expect } from 'vitest'
import {
  unionRanges,
  subtractRanges,
  countPages,
  rangesFromPages,
  pagesFromRanges,
  formatRanges,
  formatPageRangeLabel,
  parseRanges,
  clampToScope,
} from '@/lib/page-ranges'

describe('unionRanges', () => {
  it('boşluklu aralıkları ayrı tutar', () => {
    expect(unionRanges([{ start: 1, end: 36 }, { start: 42, end: 48 }])).toEqual([
      { start: 1, end: 36 },
      { start: 42, end: 48 },
    ])
  })

  it('bitişik aralıkları birleştirir (R4 §7: 1-10 + 11-20 -> 1-20)', () => {
    expect(unionRanges([{ start: 1, end: 10 }, { start: 11, end: 20 }])).toEqual([
      { start: 1, end: 20 },
    ])
  })

  it('çakışan aralıkları tek kez sayar', () => {
    expect(unionRanges([{ start: 1, end: 20 }, { start: 5, end: 8 }])).toEqual([
      { start: 1, end: 20 },
    ])
  })

  it('sırasız girdiyi sıralar', () => {
    expect(unionRanges([{ start: 42, end: 48 }, { start: 1, end: 5 }])).toEqual([
      { start: 1, end: 5 },
      { start: 42, end: 48 },
    ])
  })

  it('geçersiz aralıkları eler', () => {
    expect(unionRanges([{ start: 10, end: 4 }, { start: 0, end: 3 }, { start: 2, end: 2 }])).toEqual([
      { start: 2, end: 2 },
    ])
  })
})

describe('subtractRanges', () => {
  it('R4 §4 örneği: 1-56 eksi 1-36 ve 42-48 -> 37-41, 49-56', () => {
    const remaining = subtractRanges(
      [{ start: 1, end: 56 }],
      [{ start: 1, end: 36 }, { start: 42, end: 48 }]
    )
    expect(remaining).toEqual([{ start: 37, end: 41 }, { start: 49, end: 56 }])
    expect(formatRanges(remaining)).toBe('37-41, 49-56')
  })

  it('tamamı verilmişse kalan boştur', () => {
    expect(subtractRanges([{ start: 1, end: 10 }], [{ start: 1, end: 10 }])).toEqual([])
  })

  it('hiç verilmemişse kapsam aynen kalır', () => {
    expect(subtractRanges([{ start: 1, end: 10 }], [])).toEqual([{ start: 1, end: 10 }])
  })

  it('kapsam dışındaki çıkarma kapsamı etkilemez', () => {
    expect(subtractRanges([{ start: 1, end: 10 }], [{ start: 20, end: 30 }])).toEqual([
      { start: 1, end: 10 },
    ])
  })

  it('ortadan tek sayfa çıkarır', () => {
    expect(subtractRanges([{ start: 1, end: 5 }], [{ start: 3, end: 3 }])).toEqual([
      { start: 1, end: 2 },
      { start: 4, end: 5 },
    ])
  })
})

describe('countPages', () => {
  it('benzersiz sayfa sayar; çakışma iki kez sayılmaz', () => {
    expect(countPages([{ start: 1, end: 36 }, { start: 42, end: 48 }])).toBe(43)
    expect(countPages([{ start: 1, end: 20 }, { start: 5, end: 10 }])).toBe(20)
  })

  it('R4 §5 örneği: 43/56 -> %77', () => {
    const total = countPages([{ start: 1, end: 56 }])
    const done = countPages([{ start: 1, end: 36 }, { start: 42, end: 48 }])
    expect(Math.round((done / total) * 100)).toBe(77)
  })
})

describe('rangesFromPages / pagesFromRanges', () => {
  it('sayfa numaralarını aralığa toplar', () => {
    expect(rangesFromPages([1, 2, 3, 7, 8])).toEqual([
      { start: 1, end: 3 },
      { start: 7, end: 8 },
    ])
  })

  it('tekrar eden sayfaları tek kez alır', () => {
    expect(rangesFromPages([5, 5, 6])).toEqual([{ start: 5, end: 6 }])
  })

  it('gidiş-dönüş dönüşümü kayıpsızdır', () => {
    const ranges = [{ start: 1, end: 3 }, { start: 9, end: 10 }]
    expect(rangesFromPages(pagesFromRanges(ranges))).toEqual(ranges)
  })
})

describe('formatRanges', () => {
  it('tek sayfayı tek numara olarak yazar', () => {
    expect(formatRanges([{ start: 37, end: 37 }])).toBe('37')
  })

  it('boş listede boş metin döner', () => {
    expect(formatRanges([])).toBe('')
    expect(formatPageRangeLabel([])).toBe('')
  })

  it('ödev metni etiketi üretir', () => {
    expect(formatPageRangeLabel([{ start: 1, end: 36 }, { start: 42, end: 48 }])).toBe(
      'sf. 1-36, 42-48'
    )
  })
})

describe('parseRanges', () => {
  it('virgüllü aralık metnini ayrıştırır', () => {
    expect(parseRanges('1-36, 42-48').ranges).toEqual([
      { start: 1, end: 36 },
      { start: 42, end: 48 },
    ])
  })

  it('"sf." önekini ve noktalı virgülü kabul eder', () => {
    expect(parseRanges('sf. 1-36; 42').ranges).toEqual([
      { start: 1, end: 36 },
      { start: 42, end: 42 },
    ])
  })

  it('anlaşılmayan parçaları invalid olarak döner', () => {
    const result = parseRanges('1-10, abc, 20-5')
    expect(result.ranges).toEqual([{ start: 1, end: 10 }])
    expect(result.invalid).toEqual(['abc', '20-5'])
  })

  it('boş metinde boş sonuç döner', () => {
    expect(parseRanges('   ')).toEqual({ ranges: [], invalid: [] })
  })
})

describe('clampToScope', () => {
  it('bölüm kapsamı dışına taşan aralığı kırpar', () => {
    expect(clampToScope([{ start: 40, end: 80 }], { start: 1, end: 56 })).toEqual([
      { start: 40, end: 56 },
    ])
  })

  it('tamamen kapsam dışındaki aralığı eler', () => {
    expect(clampToScope([{ start: 90, end: 99 }], { start: 1, end: 56 })).toEqual([])
  })
})
