// Ödev içerik detayı (R6-06).
//
// Kural: "0/71 neydi?" sorusunu yanıtlayan yapıyı üreten TEK yer burasıdır.
//
// Detay HER ZAMAN homework_items'tan TÜRETİLİR; ödev kaydına ayrıca bir kopya
// metin alanı yazılmaz. Kopya tutmak, bölüm adı sonradan değiştiğinde ya da
// ödev düzenlendiğinde iki kaynağın ayrışmasına yol açardı.
//
// 71 sayfalık bir ödev 71 satıra açılmaz: numaralar lib/page-ranges.ts'teki
// aralık sıkıştırmasıyla tek satıra indirilir (F1 sf.6-26, 61-81).

import { formatSelectedUnits } from '@/lib/book-map'

/** Ham girdi: homework_items + join'lenmiş kitap/bölüm/birim bilgisi. */
export interface HomeworkDetailItem {
  bookId: string | null
  bookTitle: string | null
  trackingMode: string | null
  sectionId: string | null
  sectionTitle: string | null
  /** book_tests.order_index — test numarası veya sayfa numarası. */
  orderIndex: number | null
}

export interface HomeworkDetailSection {
  title: string
  /** Sıkıştırılmış okunur aralık: "sf. 6-26, 61-81" veya "1, 3. Test". */
  units: string
  count: number
}

export interface HomeworkDetailBook {
  bookTitle: string
  trackingMode: string
  sections: HomeworkDetailSection[]
  count: number
}

/**
 * Ödev kalemlerini kaynak > bölüm > aralık hiyerarşisine çevirir.
 *
 * Sıra korunur: kitaplar ilk görüldükleri sırada, bölümler de öyle. Bu,
 * ödev verilirken kurulan sırayla aynıdır ve eğitmenin beklediği düzendir.
 */
export function buildHomeworkDetail(items: HomeworkDetailItem[]): HomeworkDetailBook[] {
  const byBook = new Map<
    string,
    {
      bookTitle: string
      trackingMode: string
      sections: Map<string, { title: string; orderIndexes: number[] }>
    }
  >()

  for (const item of items) {
    const bookKey = item.bookId ?? item.bookTitle ?? '—'
    const book = byBook.get(bookKey) ?? {
      bookTitle: item.bookTitle ?? 'Kaynak',
      trackingMode: item.trackingMode ?? 'test',
      sections: new Map<string, { title: string; orderIndexes: number[] }>(),
    }

    const sectionKey = item.sectionId ?? item.sectionTitle ?? '—'
    const section = book.sections.get(sectionKey) ?? {
      title: item.sectionTitle ?? 'Bölüm',
      orderIndexes: [],
    }
    if (item.orderIndex != null) section.orderIndexes.push(item.orderIndex)

    book.sections.set(sectionKey, section)
    byBook.set(bookKey, book)
  }

  return [...byBook.values()].map(book => {
    const sections = [...book.sections.values()].map(section => ({
      title: section.title,
      units: formatSelectedUnits(section.orderIndexes, book.trackingMode),
      count: section.orderIndexes.length,
    }))
    return {
      bookTitle: book.bookTitle,
      trackingMode: book.trackingMode,
      sections,
      count: sections.reduce((n, s) => n + s.count, 0),
    }
  })
}
