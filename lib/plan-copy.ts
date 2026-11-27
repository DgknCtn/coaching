import type { BookMapBook } from '@/lib/book-map'
import { isActionApplicable } from '@/lib/bulk-actions'

// PLANI KOPYALA (Feature Showcase PRD 10.4, Faz 2a) — saf kural.
//
// Kitap işi AYNEN kopyalanmaz: geçen planın testleri zaten verilmiş ya da
// yapılmış. Kopya "DEVAMINI GETİR" demektir: geçen plan bir kitaptan N
// birim verdiyse, aynı kitapta geçen planın SON biriminden sonraki ilk N
// VERİLEBİLİR birim önerilir (Test 4-6 → Test 7-9). Verilebilirlik kuralı
// seçim çubuğundaki "Ödeve Ekle" ile aynı (lib/bulk-actions.ts).

/** Kitabın birimleri haritadaki sırayla (bölüm sırası, sonra test sırası). */
function orderedUnits(book: BookMapBook) {
  return book.sections.flatMap(s => s.tests)
}

export function continuationUnitIds(book: BookMapBook, previousTestIds: string[]): string[] {
  const count = previousTestIds.length
  if (count === 0) return []
  const units = orderedUnits(book)
  const prev = new Set(previousTestIds)
  let last = -1
  units.forEach((u, i) => {
    if (prev.has(u.id)) last = i
  })
  return units
    .slice(last + 1)
    .filter(u => isActionApplicable('assign', u.state))
    .slice(0, count)
    .map(u => u.id)
}

export interface PlanCopyBook {
  bookId: string
  testIds: string[]
}

/** Geçen planın kitap kalemlerinden, haritadaki kitaplar için devam önerisi. */
export function planContinuation(
  books: BookMapBook[],
  previous: PlanCopyBook[]
): { bookId: string; title: string; ids: string[]; asked: number }[] {
  const byId = new Map(books.map(b => [b.bookId, b]))
  return previous
    .map(p => {
      const book = byId.get(p.bookId)
      if (!book) return null
      return { bookId: p.bookId, title: book.title, ids: continuationUnitIds(book, p.testIds), asked: p.testIds.length }
    })
    .filter((x): x is { bookId: string; title: string; ids: string[]; asked: number } => x !== null)
}
