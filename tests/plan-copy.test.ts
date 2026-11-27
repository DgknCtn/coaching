import { describe, expect, it } from 'vitest'
import { continuationUnitIds, planContinuation } from '@/lib/plan-copy'
import { demoBook } from '@/components/marketing/demo/tour-fixtures'

// Faz 2a · Planı kopyala — "devamını getir" kuralı.
// Örnek kitap (tour-fixtures): Denklemler 1-4 tamam, 5-6 onay bekliyor;
// Problemler 1-2 tamam, 3 gecikti, 4-5 ödevde, 6 verilmedi; Oran 1 tamam,
// 2 iade, 3 ödevde, 4-6 verilmedi; Fonksiyonlar 1-5 verilmedi.

const book = demoBook()
const id = (s: number, t: number) => `demo-s${s}-t${t}`

describe('continuationUnitIds', () => {
  it('geçen planın son biriminden sonraki ilk N verilebilir birim', () => {
    // Geçen plan: Problemler 4-5 (2 birim) → sonraki verilebilir 2: Problemler 6, Oran 2 (iade edilen verilebilir)
    const next = continuationUnitIds(book, [id(1, 4), id(1, 5)])
    expect(next).toHaveLength(2)
    expect(next[0]).toBe(id(1, 6))
  })

  it('verilmiş, onay bekleyen ve tamamlanmış birimler atlanır', () => {
    const next = continuationUnitIds(book, [id(0, 1)])
    const states = new Map(book.sections.flatMap(s => s.tests).map(t => [t.id, t.state]))
    for (const n of next) expect(['not_assigned', 'returned']).toContain(states.get(n))
  })

  it('kitabın sonuna gelinince daha azını döner; boş girdi boş çıktı', () => {
    expect(continuationUnitIds(book, [id(3, 5)])).toEqual([])
    expect(continuationUnitIds(book, [])).toEqual([])
  })

  it('geçen birim haritada yoksa baştan ilk verilebilirden başlar', () => {
    const next = continuationUnitIds(book, ['silinmis-test'])
    expect(next).toHaveLength(1)
  })
})

describe('planContinuation', () => {
  it('haritada olmayan kitap (arşivlenmiş) atlanır; istenen ve bulunan sayı ayrı', () => {
    const r = planContinuation([book], [
      { bookId: book.bookId, testIds: [id(2, 3), id(2, 4)] },
      { bookId: 'baska-kitap', testIds: ['x'] },
    ])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ bookId: book.bookId, asked: 2 })
    expect(r[0].ids.length).toBe(2)
  })
})
