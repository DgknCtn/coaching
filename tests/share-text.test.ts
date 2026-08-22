import { describe, it, expect } from 'vitest'
import { buildShareText } from '@/lib/share-text'

describe('buildShareText (R4 §7)', () => {
  it('PDF örneğindeki mesajı birebir üretir', () => {
    const text = buildShareText({
      studentName: 'Ömer',
      dueDate: '2026-08-30',
      books: [
        {
          bookTitle: '345 Matematik',
          trackingMode: 'test',
          sections: [{ title: 'Polinomlar', units: [3, 4, 5] }],
        },
        {
          bookTitle: 'Metin 10.Sınıf Matematik',
          trackingMode: 'page',
          sections: [
            { title: 'Üçgenler', units: [...range(1, 36), ...range(42, 48)] },
          ],
        },
        {
          bookTitle: 'Zeduva 9.Sınıf Fizik',
          trackingMode: 'page',
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
        'Teslim tarihi: 30.08.2026',
        '',
        '345 Matematik',
        '• Polinomlar → 3-5. Test',
        '',
        'Metin 10.Sınıf Matematik',
        '• Üçgenler → sf. 1-36, 42-48',
        '',
        'Zeduva 9.Sınıf Fizik',
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
