import { describe, it, expect } from 'vitest'
import { parseBookBackup, bookIdentityKey } from '@/lib/book-backup'

// YEDEKTEN GERİ YÜKLEME.
//
// Bu ayrıştırıcının işi, kullanıcının aylar önce indirdiği bir dosyayı
// okumak. Dosya elle düzenlenmiş, yarım inmiş ya da başka bir sürümden
// kalmış olabilir; ayrıştırıcı hiçbir durumda ÇÖKMEMELİ ve sessizce
// eksik kitap üretmemeli — alamadığını "atlandı" diye söylemeli.

function book(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    title: 'AYT Matematik Soru Bankası',
    subject: 'Matematik',
    publisher: 'Örnek Yayınları',
    level_exam: 'AYT',
    edition_year: 2025,
    tracking_mode: 'test',
    video_mode: 'none',
    video_url: null,
    description: null,
    status: 'active',
    book_sections: [
      {
        title: 'Türev',
        order_index: 1,
        note: null,
        book_tests: [{ title: '1. Test' }, { title: '2. Test' }],
      },
    ],
    ...overrides,
  }
}

describe('parseBookBackup', () => {
  it('yedek sarmalını ve düz diziyi aynı şekilde okur', () => {
    const wrapped = parseBookBackup(JSON.stringify({ book_count: 1, books: [book()] }))
    const bare = parseBookBackup(JSON.stringify([book()]))

    expect(wrapped.books).toEqual(bare.books)
    expect(wrapped.books).toHaveLength(1)
  })

  it('test sayısını bölümdeki test satırlarından türetir', () => {
    const { books } = parseBookBackup(JSON.stringify([book()]))
    expect(books[0].sections[0].test_count).toBe(2)
    expect(books[0].testCount).toBe(2)
  })

  it('bölümleri order_index sırasına koyar', () => {
    // Elle düzenlenmiş dosyada dizilim bozulmuş olabilir; sıra
    // order_index'ten gelmeli, yoksa kitabın bölümleri karışır.
    const { books } = parseBookBackup(
      JSON.stringify([
        book({
          book_sections: [
            { title: 'İkinci', order_index: 2, book_tests: [] },
            { title: 'Birinci', order_index: 1, book_tests: [] },
          ],
        }),
      ])
    )
    expect(books[0].sections.map((s) => s.title)).toEqual(['Birinci', 'İkinci'])
  })

  it('sayfa takipli kitapta aralığı korur ve test saymaz', () => {
    // Sayfa aralığı verildiğinde testleri RPC sayfa sayfa üretir;
    // ayrıca test_count göndermek aynı testleri iki kez saydırırdı.
    const { books } = parseBookBackup(
      JSON.stringify([
        book({
          tracking_mode: 'page',
          book_sections: [
            {
              title: 'Üçgenler',
              order_index: 1,
              page_start: 10,
              page_end: 14,
              book_tests: [{ title: 'sf. 10' }],
            },
          ],
        }),
      ])
    )

    const section = books[0].sections[0]
    expect(section.page_start).toBe(10)
    expect(section.page_end).toBe(14)
    expect(section.test_count).toBe(0)
    // Önizlemedeki sayı sayfa aralığından gelir: 10..14 = 5 birim.
    expect(books[0].testCount).toBe(5)
  })

  it('sayfa aralığını yalnız sayfa takipli kitapta uygular', () => {
    const { books } = parseBookBackup(
      JSON.stringify([
        book({
          tracking_mode: 'test',
          book_sections: [
            { title: 'Türev', order_index: 1, page_start: 1, page_end: 9, book_tests: [] },
          ],
        }),
      ])
    )
    expect(books[0].sections[0].page_start).toBeNull()
  })

  it('bilinmeyen seviye ve video değerlerini güvenli varsayılana düşürür', () => {
    // Başka bir sürümden kalmış bir dosya, artık geçerli olmayan bir
    // seviye taşıyabilir. Kitabı reddetmek yerine alanı boşaltmak,
    // kullanıcının kitabını kurtarır.
    const { books, skipped } = parseBookBackup(
      JSON.stringify([book({ level_exam: 'ESKİ_SINAV', video_mode: 'zorunlu_video' })])
    )
    expect(skipped).toHaveLength(0)
    expect(books[0].levelExam).toBe('')
    expect(books[0].videoMode).toBe('none')
  })

  it('arşivlenmiş kitabı havuza geri koymaz', () => {
    const { books, skipped } = parseBookBackup(JSON.stringify([book({ status: 'archived' })]))
    expect(books).toHaveLength(0)
    expect(skipped[0]).toContain('arşivlenmiş')
  })

  it('eksik kitabı atlar ama sağlam olanı almaya devam eder', () => {
    // Tek bozuk kayıt yüzünden 80 kitaplık bir yedeği reddetmek, yedeği
    // işe yaramaz kılardı.
    const { books, skipped } = parseBookBackup(
      JSON.stringify([book({ title: '' }), book({ title: 'TYT Fizik' })])
    )
    expect(books.map((b) => b.title)).toEqual(['TYT Fizik'])
    expect(skipped).toHaveLength(1)
  })

  it('100 bölümü aşan kitabı kırpmak yerine atlar', () => {
    // Kırpmak, kullanıcıya yarısı eksik bir kitabı hiçbir şey söylemeden
    // vermek olurdu.
    const sections = Array.from({ length: 101 }, (_, i) => ({
      title: `Bölüm ${i + 1}`,
      order_index: i + 1,
      book_tests: [],
    }))
    const { books, skipped } = parseBookBackup(JSON.stringify([book({ book_sections: sections })]))

    expect(books).toHaveLength(0)
    expect(skipped[0]).toContain('101 bölüm')
  })

  it('bozuk JSON ve yanlış dosyada çökmez, sebebini söyler', () => {
    expect(parseBookBackup('{ bu json değil').fatal).toBeTruthy()
    expect(parseBookBackup('{"foo":1}').fatal).toBeTruthy()
    expect(parseBookBackup('{"books":[]}').fatal).toBeTruthy()
    expect(parseBookBackup('null').fatal).toBeTruthy()
  })
})

describe('bookIdentityKey', () => {
  it('yalnız büyük/küçük harf ve boşlukta farklı olanı aynı sayar', () => {
    expect(bookIdentityKey('  Matematik ', 'Örnek', 2025)).toBe(
      bookIdentityKey('MATEMATİK', 'örnek', 2025)
    )
  })

  it('farklı baskı yılını ayrı kitap sayar', () => {
    // R4 §1B: yeni baskı ayrı bir kayıttır; birleştirmek 2025 içeriğini
    // 2026'nın üstüne yazmak olurdu.
    expect(bookIdentityKey('Matematik', 'Örnek', 2025)).not.toBe(
      bookIdentityKey('Matematik', 'Örnek', 2026)
    )
  })
})
