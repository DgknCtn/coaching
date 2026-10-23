import { describe, expect, it } from 'vitest'
import { formatBookCoverage, type SourceCoverage } from '@/lib/curriculum-book-coverage'

// M1.0-06 — "Kitap kapsamı" sütunu. Konu özetinde farklı kaynakların
// sayfa/test adedi TEK PAYDAYA toplanmamalı (kabul kriteri); formatBookCoverage
// yalnız KAYNAK SAYISINA bakar, test/sayfa adedine değil.

function source(over: Partial<SourceCoverage> & { bookId: string }): SourceCoverage {
  return {
    bookTitle: 'Kitap',
    fullyCompleted: false,
    hasContact: false,
    ...over,
  }
}

describe('formatBookCoverage', () => {
  it('kaynak yoksa "-"', () => {
    expect(formatBookCoverage([])).toBe('-')
  })

  it('tek kaynak tamamlandıysa "{kitap} ✓"', () => {
    const s = source({ bookId: 'b1', bookTitle: '345 Geo 1', fullyCompleted: true, hasContact: true })
    expect(formatBookCoverage([s])).toBe('345 Geo 1 ✓')
  })

  it('tek kaynakta yalnız temas varsa "{kitap}: temas var"', () => {
    const s = source({ bookId: 'b1', bookTitle: '345', fullyCompleted: false, hasContact: true })
    expect(formatBookCoverage([s])).toBe('345: temas var')
  })

  it('tek kaynakta hiç temas yoksa "-"', () => {
    const s = source({ bookId: 'b1', bookTitle: '345', fullyCompleted: false, hasContact: false })
    expect(formatBookCoverage([s])).toBe('-')
  })

  it('çoklu kaynakta "N/M kaynak tamamlandı" — sayfa/test adedi değil KAYNAK sayısı', () => {
    // M1.0-06 TEST A02 senaryosu: "Üçgende Alan" bölümü 2 konuya bağlı —
    // burada ters açıdan test edilen şey, AYNI konunun birden çok KİTABA
    // (kaynağa) bağlı olması. 3 kaynaktan 2'si tamamlanmış.
    const sources = [
      source({ bookId: 'b1', bookTitle: 'Kitap A', fullyCompleted: true, hasContact: true }),
      source({ bookId: 'b2', bookTitle: 'Kitap B', fullyCompleted: true, hasContact: true }),
      source({ bookId: 'b3', bookTitle: 'Kitap C', fullyCompleted: false, hasContact: true }),
    ]
    expect(formatBookCoverage(sources)).toBe('2/3 kaynak tamamlandı')
  })

  it('çoklu kaynakta hiçbiri tamamlanmamışsa "0/N kaynak tamamlandı"', () => {
    const sources = [
      source({ bookId: 'b1', fullyCompleted: false, hasContact: true }),
      source({ bookId: 'b2', fullyCompleted: false, hasContact: false }),
    ]
    expect(formatBookCoverage(sources)).toBe('0/2 kaynak tamamlandı')
  })
})
