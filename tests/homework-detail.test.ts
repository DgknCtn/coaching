import { describe, expect, it } from 'vitest'
import { buildHomeworkDetail, type HomeworkDetailItem } from '@/lib/homework-detail'

// R6-06 kabul testleri 40-44.

function pageItem(section: string, page: number): HomeworkDetailItem {
  return {
    bookId: 'mof',
    bookTitle: 'MÖF Matematik',
    trackingMode: 'page',
    sectionId: section,
    sectionTitle: section,
    orderIndex: page,
  }
}

function testItem(section: string, no: number): HomeworkDetailItem {
  return {
    bookId: '345',
    bookTitle: '345 Matematik',
    trackingMode: 'test',
    sectionId: section,
    sectionTitle: section,
    orderIndex: no,
  }
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

describe('buildHomeworkDetail', () => {
  it('kabul #41: sayfa aralıkları bölüm bölüm sıkıştırılır', () => {
    const items = [
      ...range(6, 26).map(p => pageItem('F1 · Sayılar', p)),
      ...range(61, 81).map(p => pageItem('F1 · Sayılar', p)),
      ...range(5, 25).map(p => pageItem('F2 · Nicelikler', p)),
      ...range(33, 40).map(p => pageItem('F2 · Nicelikler', p)),
    ]

    const detail = buildHomeworkDetail(items)

    expect(detail).toHaveLength(1)
    expect(detail[0].bookTitle).toBe('MÖF Matematik')
    expect(detail[0].sections.map(s => s.units)).toEqual([
      'sf. 6-26, 61-81',
      'sf. 5-25, 33-40',
    ])
  })

  it('kabul #40: 71 sayfalık ödev 71 satıra açılmaz', () => {
    const items = range(1, 71).map(p => pageItem('F1', p))
    const detail = buildHomeworkDetail(items)

    expect(detail[0].count).toBe(71)
    // Tek bölüm, tek satır.
    expect(detail[0].sections).toHaveLength(1)
    expect(detail[0].sections[0].units).toBe('sf. 1-71')
  })

  it('kabul #42: test kitabında kompakt test listesi', () => {
    const detail = buildHomeworkDetail([
      testItem('Polinomlar', 1),
      testItem('Polinomlar', 3),
    ])
    expect(detail[0].sections[0].units).toBe('1, 3. Test')
  })

  it('birden fazla kaynak ilk görülme sırasında kalır', () => {
    const detail = buildHomeworkDetail([
      pageItem('F1', 6),
      testItem('Polinomlar', 1),
      pageItem('F1', 7),
    ])
    expect(detail.map(b => b.bookTitle)).toEqual(['MÖF Matematik', '345 Matematik'])
    expect(detail[0].sections[0].units).toBe('sf. 6-7')
  })

  it('eksik alanlar çökmeye yol açmaz', () => {
    const detail = buildHomeworkDetail([
      { bookId: null, bookTitle: null, trackingMode: null, sectionId: null, sectionTitle: null, orderIndex: null },
    ])
    expect(detail[0].bookTitle).toBe('Kaynak')
    expect(detail[0].sections[0].title).toBe('Bölüm')
    expect(detail[0].count).toBe(0)
  })

  it('boş girdi boş liste üretir', () => {
    expect(buildHomeworkDetail([])).toEqual([])
  })
})
