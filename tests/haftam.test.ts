import { describe, it, expect } from 'vitest'
import {
  cardUnitLabel,
  groupIntoCards,
  sortCardsForDay,
  type HaftamWork,
} from '@/lib/haftam'

// HAFTAM V2 — kart gruplaması (R8).
//
// Belgenin §7 veri ilkesi burada sınanıyor: kart bağımsız bir kayıt
// değil, tekil çalışmaların görsel gruplaması. Kart bölündüğünde KALAN
// aralığın doğru yazılması (kabul #3) ve sayfa aralığının bölünebilmesi
// (kabul #5) bu modülün işi.

function work(over: Partial<HaftamWork> & { id: string; testTitle: string }): HaftamWork {
  return {
    bookTitle: 'Bilgi Sarmal',
    sectionTitle: 'Fonksiyonlar',
    plannedForDate: null,
    submitted: false,
    approved: false,
    returned: false,
    lateAdded: false,
    bookId: 'book-1',
    sectionId: 'section-1',
    note: null,
    teacherNote: null,
    ...over,
  }
}

describe('cardUnitLabel', () => {
  it('bitişik testleri tek aralığa indirger', () => {
    const label = cardUnitLabel([
      work({ id: '1', testTitle: '1. Test' }),
      work({ id: '2', testTitle: '2. Test' }),
      work({ id: '3', testTitle: '3. Test' }),
      work({ id: '4', testTitle: '4. Test' }),
    ])
    expect(label).toBe('Test 1-4')
  })

  it('kart bölündükten sonra KALANI parçalı gösterir', () => {
    // Kabul #3: "Test 1-7"ten 2-3-4 Salı'ya ayrıldığında planlanmamışta
    // kalan 1, 5, 6, 7'dir ve bu, "Test 1-7" diye gösterilemez.
    const label = cardUnitLabel([
      work({ id: '1', testTitle: '1. Test' }),
      work({ id: '5', testTitle: '5. Test' }),
      work({ id: '6', testTitle: '6. Test' }),
      work({ id: '7', testTitle: '7. Test' }),
    ])
    expect(label).toBe('Test 1, 5-7')
  })

  it('sayfa birimlerini "sf." ile etiketler', () => {
    // Kabul #5: sf.35-60 iki güne bölünebilmeli; bölünen parçanın
    // etiketi de sayfa dilinde olmalı.
    const label = cardUnitLabel([
      work({ id: 'a', testTitle: 'sf. 35' }),
      work({ id: 'b', testTitle: 'sf. 36' }),
      work({ id: 'c', testTitle: 'sf. 37' }),
    ])
    expect(label).toBe('sf. 35-37')
  })

  it('tek birimde aralık yazmaz', () => {
    expect(cardUnitLabel([work({ id: '9', testTitle: '9. Test' })])).toBe('Test 9')
  })

  it('sayı okunamayan başlıkta uydurmaz, ham başlığı gösterir', () => {
    expect(cardUnitLabel([work({ id: 'x', testTitle: 'Karma Deneme' })])).toBe('Karma Deneme')
  })
})

describe('groupIntoCards', () => {
  it('aynı gün + kitap + bölümü tek kartta toplar', () => {
    const cards = groupIntoCards([
      work({ id: '1', testTitle: '1. Test', plannedForDate: '2026-09-22' }),
      work({ id: '2', testTitle: '2. Test', plannedForDate: '2026-09-22' }),
    ])
    expect(cards).toHaveLength(1)
    expect(cards[0].unitLabel).toBe('Test 1-2')
    expect(cards[0].works).toHaveLength(2)
  })

  it('günü farklı olanı AYRI kartlara böler', () => {
    // Kabul #2: kartın bir kısmı Salı'ya ayrıldığında iki kart oluşur.
    const cards = groupIntoCards([
      work({ id: '1', testTitle: '1. Test', plannedForDate: null }),
      work({ id: '2', testTitle: '2. Test', plannedForDate: '2026-09-23' }),
      work({ id: '3', testTitle: '3. Test', plannedForDate: '2026-09-23' }),
      work({ id: '4', testTitle: '4. Test', plannedForDate: '2026-09-23' }),
      work({ id: '5', testTitle: '5. Test', plannedForDate: null }),
    ])
    expect(cards).toHaveLength(2)

    const tuesday = cards.find(c => c.works[0].plannedForDate === '2026-09-23')!
    const unplanned = cards.find(c => c.works[0].plannedForDate === null)!

    expect(tuesday.unitLabel).toBe('Test 2-4')
    expect(unplanned.unitLabel).toBe('Test 1, 5')
  })

  it('bölümü farklı olanı birleştirmez', () => {
    // Akademik bağlam silinmemeli.
    const cards = groupIntoCards([
      work({ id: '1', testTitle: '1. Test', sectionId: 's1', sectionTitle: 'Fonksiyonlar' }),
      work({ id: '2', testTitle: '2. Test', sectionId: 's2', sectionTitle: 'Polinomlar' }),
    ])
    expect(cards).toHaveLength(2)
  })

  it('kart, bir kalem bile açıkken "teslim" sayılmaz', () => {
    const cards = groupIntoCards([
      work({ id: '1', testTitle: '1. Test', submitted: true }),
      work({ id: '2', testTitle: '2. Test', submitted: false }),
    ])
    expect(cards[0].submitted).toBe(false)
  })

  it('kartın tamamı teslim edildiyse teslim sayılır', () => {
    const cards = groupIntoCards([
      work({ id: '1', testTitle: '1. Test', submitted: true }),
      work({ id: '2', testTitle: '2. Test', submitted: true }),
    ])
    expect(cards[0].submitted).toBe(true)
  })

  it('iade edilmiş kalem kartta işaretlenir', () => {
    const cards = groupIntoCards([
      work({ id: '1', testTitle: '1. Test' }),
      work({ id: '2', testTitle: '2. Test', returned: true }),
    ])
    expect(cards[0].hasReturned).toBe(true)
  })
})

describe('sortCardsForDay', () => {
  it('teslim edilen kartı listenin ALTINA indirir', () => {
    // Kabul #8: tiklenen çalışma aynı günde kalır ama alta iner.
    const cards = groupIntoCards([
      work({ id: '1', testTitle: '1. Test', sectionId: 's1', submitted: true }),
      work({ id: '2', testTitle: '2. Test', sectionId: 's2', submitted: false }),
    ])
    const sorted = sortCardsForDay(cards)
    expect(sorted[0].submitted).toBe(false)
    expect(sorted[1].submitted).toBe(true)
  })
})
