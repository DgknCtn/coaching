import { describe, it, expect } from 'vitest'
import { buildShareText, formatDueDate } from '@/lib/share-text'

describe('buildShareText (R4 §7)', () => {
  it('PDF örneğindeki mesajı birebir üretir', () => {
    const text = buildShareText({
      studentName: 'Ömer',
      dueDate: '2026-08-30',
      // R7-01 gün farkı dinamik; test "bugün"ü sabitler.
      today: '2026-08-23',
      books: [
        {
          bookTitle: '345 Matematik',
          trackingMode: 'test',
          unitCount: 3,
          sections: [{ title: 'Polinomlar', units: [3, 4, 5] }],
        },
        {
          bookTitle: 'Metin 10.Sınıf Matematik',
          trackingMode: 'page',
          unitCount: 43,
          sections: [
            { title: 'Üçgenler', units: [...range(1, 36), ...range(42, 48)] },
          ],
        },
        {
          bookTitle: 'Zeduva 9.Sınıf Fizik',
          trackingMode: 'page',
          unitCount: 20,
          sections: [{ title: 'Hareket', units: range(72, 91) }],
          videoTasks: ['Hareket konu anlatım videolarını izle'],
        },
      ],
    })

    expect(text).toBe(
      [
        'Merhaba Ömer,',
        '',
        'Bu haftaki çalışmaların:',
        'Teslim tarihi: 30 Ağustos 2026 Pazar (7 gün sonra)',
        '',
        '345 Matematik (3 test)',
        '• Polinomlar → 3-5. Test',
        '',
        'Metin 10.Sınıf Matematik (43 sayfa)',
        '• Üçgenler → sf. 1-36, 42-48',
        '',
        'Zeduva 9.Sınıf Fizik (20 sayfa)',
        '• Hareket → sf. 72-91',
        '• Hareket konu anlatım videolarını izle',
        '',
        'Çalışmalarını tamamladığında panelden durumunu işaretlemeyi unutma.',
      ].join('\n')
    )
  })

  it('ardışık testleri sıkıştırır (1,2,3,4,5. Test -> 1-5. Test)', () => {
    const text = buildShareText({
      studentName: 'Ayşe',
      dueDate: '2026-09-01',
      books: [
        {
          bookTitle: 'Bilgi Sarmal TYT Kimya',
          trackingMode: 'test',
          sections: [{ title: 'Mol', units: [1, 2, 3, 4, 5] }],
        },
      ],
    })
    expect(text).toContain('• Mol → 1-5. Test')
  })

  it('bitişik sayfa aralıklarını birleştirir (1-10 + 11-20 -> 1-20)', () => {
    const text = buildShareText({
      studentName: 'Ayşe',
      dueDate: null,
      books: [
        {
          bookTitle: 'Metin Matematik',
          trackingMode: 'page',
          sections: [{ title: 'Fonksiyonlar', units: [...range(1, 10), ...range(11, 20)] }],
        },
      ],
    })
    expect(text).toContain('• Fonksiyonlar → sf. 1-20')
  })

  it('teslim tarihi yoksa tire yazar', () => {
    const text = buildShareText({ studentName: 'Ali', dueDate: null, books: [] })
    expect(text).toContain('Teslim tarihi: —')
  })

  it('yalnız video görevi olan kitabı da listeler', () => {
    const text = buildShareText({
      studentName: 'Ali',
      dueDate: '2026-09-01',
      books: [
        {
          bookTitle: 'Zeduva Fizik',
          trackingMode: 'page',
          sections: [],
          videoTasks: ['Hareket videolarını izle'],
        },
      ],
    })
    expect(text).toContain('Zeduva Fizik')
    expect(text).toContain('• Hareket videolarını izle')
  })

  it('hiç görevi olmayan kitabın başlığını yazmaz', () => {
    const text = buildShareText({
      studentName: 'Ali',
      dueDate: '2026-09-01',
      books: [{ bookTitle: 'Boş Kitap', trackingMode: 'test', sections: [] }],
    })
    expect(text).not.toContain('Boş Kitap')
  })
})

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

// ============================================================
// R6-05: Ödev Notu (kabul #36-#39)
// ============================================================

describe('buildShareText · ödev notu', () => {
  const base = {
    studentName: 'Ömer',
    dueDate: '2026-08-30',
    books: [
      {
        bookTitle: 'MÖF Matematik',
        trackingMode: 'page',
        sections: [{ title: 'F1 · Sayılar', units: [6, 7, 8] }],
      },
    ],
  }

  it('kabul #36: not boşken çıktı birebir aynı kalır', () => {
    const without = buildShareText(base)
    expect(buildShareText({ ...base, note: undefined })).toBe(without)
    expect(buildShareText({ ...base, note: null })).toBe(without)
    expect(buildShareText({ ...base, note: '   ' })).toBe(without)
    expect(without).not.toContain('Not:')
  })

  it('kabul #38: not ödev listesinin ardından görünür', () => {
    const text = buildShareText({ ...base, note: 'Parçalı fonksiyona kadar.' })
    expect(text).toContain('Not: Parçalı fonksiyona kadar.')
    expect(text.indexOf('MÖF Matematik')).toBeLessThan(text.indexOf('Not:'))
  })

  it('kabul #39: test + sayfa kaynağı birlikteyken not tek kez görünür', () => {
    const text = buildShareText({
      ...base,
      books: [
        ...base.books,
        {
          bookTitle: '345 Matematik',
          trackingMode: 'test',
          sections: [{ title: 'Polinomlar', units: [1, 2, 3] }],
        },
      ],
      note: 'Videoyu izle.',
    })
    expect(text.match(/Not: Videoyu izle\./g)).toHaveLength(1)
  })
})

// R7-01: teslim tarihi formatı.
describe('formatDueDate (R7-01)', () => {
  it('doğal tarih + kalan gün üretir', () => {
    expect(formatDueDate('2026-08-31', '2026-08-24')).toBe(
      '31 Ağustos 2026 Pazartesi (7 gün sonra)'
    )
  })

  it('bugün ve yarın için özel ifade kullanır', () => {
    expect(formatDueDate('2026-09-02', '2026-09-02')).toBe('2 Eylül 2026 Çarşamba (Bugün)')
    expect(formatDueDate('2026-09-03', '2026-09-02')).toBe('3 Eylül 2026 Perşembe (Yarın)')
  })

  it('geçmiş tarihte yanlış bilgi vermez', () => {
    expect(formatDueDate('2026-08-30', '2026-09-02')).toBe(
      '30 Ağustos 2026 Pazar (3 gün geçti)'
    )
  })

  it('tarih yoksa tire yazar', () => {
    expect(formatDueDate(null)).toBe('—')
    expect(formatDueDate('')).toBe('—')
  })
})

// R7-02: kitap bazlı çalışma adedi. Birim kaynağın takip türünden gelir.
describe('buildShareText · kitap bazlı miktar (R7-02)', () => {
  const base = { studentName: 'Ömer', dueDate: '2026-08-31', today: '2026-08-24' }

  it('test kaynağında "(1 test)", sayfa kaynağında "(10 sayfa)" yazar', () => {
    const text = buildShareText({
      ...base,
      books: [
        {
          bookTitle: '345 Matematik',
          trackingMode: 'test',
          unitCount: 1,
          sections: [{ title: '5. Bölüm - Trigonometri 1', units: [4] }],
        },
        {
          bookTitle: 'TED Math 9 - Book 2',
          trackingMode: 'page',
          unitCount: 10,
          sections: [{ title: '4.1 Geometric Transformations', units: range(1, 10) }],
        },
      ],
    })
    expect(text).toContain('345 Matematik (1 test)')
    expect(text).toContain('TED Math 9 - Book 2 (10 sayfa)')
  })

  it('R7 takip türlerinde birim adı doğru gelir', () => {
    const text = buildShareText({
      ...base,
      books: [
        {
          bookTitle: 'Deneme Seti',
          trackingMode: 'trial',
          unitCount: 4,
          sections: [{ title: 'TYT Denemeleri', units: [1, 2, 3, 4] }],
        },
      ],
    })
    expect(text).toContain('Deneme Seti (4 deneme)')
  })

  it('miktar verilmezse başlık sade kalır (yalnız video görevi olan kitap)', () => {
    const text = buildShareText({
      ...base,
      books: [
        {
          bookTitle: '3D AYT Matematik VDD',
          trackingMode: 'test',
          sections: [],
          videoTasks: ['Türev konu anlatım videolarını izle'],
        },
      ],
    })
    expect(text).toContain('\n3D AYT Matematik VDD\n')
  })
})
