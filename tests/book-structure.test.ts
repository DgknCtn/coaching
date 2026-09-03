import { describe, expect, it } from 'vitest'
import {
  formatTestRange,
  orderLeafSections,
  testCountFromRange,
  type SectionNode,
} from '@/lib/book-structure'

// R7-03 kabul testleri.
//
// Şartnamenin kendi kontrol sayıları burada fixture olarak duruyor
// (3D TYT Matematik: Bölüm 1 = 104 test, kitap toplamı = 177). Hesap
// bozulursa bu dosya derhal kırmızıya döner.

function node(
  id: string,
  orderIndex: number,
  testCount: number,
  parentSectionId: string | null = null
): SectionNode {
  return { id, orderIndex, parentSectionId, testCount }
}

describe('testCountFromRange · adet aralıktan hesaplanır', () => {
  it('Son - İlk + 1', () => {
    expect(testCountFromRange(44, 48)).toBe(5)
    expect(testCountFromRange(1, 4)).toBe(4)
    expect(testCountFromRange(65, 71)).toBe(7)
  })

  it('tek testlik aralık geçerlidir', () => {
    // 3D TYT'de "Asal Çarpanlara Ayırma ve Bölen Sayısı" tek test: 17-17.
    expect(testCountFromRange(17, 17)).toBe(1)
  })

  it('geçersiz aralıkta sıfır döner', () => {
    expect(testCountFromRange(null, 5)).toBe(0)
    expect(testCountFromRange(5, null)).toBe(0)
    expect(testCountFromRange(0, 4)).toBe(0)
    expect(testCountFromRange(8, 5)).toBe(0)
  })
})

describe('formatTestRange', () => {
  it('aralığı ve tek testi ayrı yazar', () => {
    expect(formatTestRange(44, 48)).toBe('Test 44-48')
    expect(formatTestRange(17, 17)).toBe('Test 17')
  })

  it('aralık yoksa null döner', () => {
    expect(formatTestRange(null, null)).toBeNull()
  })
})

describe('orderLeafSections · alt bölümü OLMAYAN kitap', () => {
  // Bu blok değişikliğin regresyon güvencesidir: mevcut kitaplarda liste
  // birebir bugünkü hâlinde kalmalı.
  const flat = [node('a', 1, 5), node('b', 2, 3), node('c', 3, 4)]

  it('sırayı ve satırları aynen korur', () => {
    expect(orderLeafSections(flat).map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('sırasız gelen satırları sıra numarasına göre dizer', () => {
    const karisik = [node('c', 3, 4), node('a', 1, 5), node('b', 2, 3)]
    expect(orderLeafSections(karisik).map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('testi olmayan bölümü düşürür (bugünkü davranış)', () => {
    const bosluklu = [node('a', 1, 5), node('bos', 2, 0), node('c', 3, 4)]
    expect(orderLeafSections(bosluklu).map(s => s.id)).toEqual(['a', 'c'])
  })
})

describe('orderLeafSections · alt bölümlü kitap', () => {
  // 01. Bölüm (kapsayıcı) altında üç alt bölüm.
  const agac = [
    node('bolum1', 1, 0),
    node('temel', 1, 4, 'bolum1'),
    node('tekcift', 2, 2, 'bolum1'),
    node('tumevarim1', 3, 4, 'bolum1'),
  ]

  it('kapsayıcı bölüm satır olarak dönmez, yalnız yapraklar döner', () => {
    expect(orderLeafSections(agac).map(s => s.id)).toEqual([
      'temel',
      'tekcift',
      'tumevarim1',
    ])
  })

  it('alt bölümler kendi sıralarında kalır', () => {
    const karisik = [agac[3], agac[1], agac[0], agac[2]]
    expect(orderLeafSections(karisik).map(s => s.id)).toEqual([
      'temel',
      'tekcift',
      'tumevarim1',
    ])
  })

  it('bölümler arası sıra ebeveynin sırasından gelir', () => {
    const ikiBolum = [
      node('b2', 2, 0),
      node('kumeler', 1, 5, 'b2'),
      node('b1', 1, 0),
      node('temel', 1, 4, 'b1'),
    ]
    expect(orderLeafSections(ikiBolum).map(s => s.id)).toEqual(['temel', 'kumeler'])
  })

  it('alt bölümlü ve düz bölümler aynı kitapta karışabilir', () => {
    // Üst düzey bölüm, aynı sıradaki alt bölümlerden ÖNCE gelir.
    const karma = [
      node('duz', 1, 3),
      node('b2', 2, 0),
      node('alt', 1, 2, 'b2'),
    ]
    expect(orderLeafSections(karma).map(s => s.id)).toEqual(['duz', 'alt'])
  })

  it('ebeveyni bulunamayan alt bölüm kaybolmaz', () => {
    // Ebeveyn arşivlenmişse satırı düşürmek veri gizlemek olur; sırasını
    // kaybetmek yeğdir.
    const oksuz = [node('a', 1, 3), node('oksuz', 2, 2, 'yok')]
    expect(orderLeafSections(oksuz).map(s => s.id)).toEqual(['a', 'oksuz'])
  })
})

describe('R7-03 kabul kriteri · 3D TYT Matematik', () => {
  // Şartnamedeki hazır veri giriş tablosu.
  const bolum1 = [
    ['Temel Kavramlar', 1, 4],
    ['Tek-Çift Sayılar ve İşaret İncelemesi', 5, 6],
    ['Ardışık Sayılar', 7, 8],
    ['Faktöriyel', 9, 10],
    ['Bire Bir ÖSYM 1', 11, 12],
    ['Sayı Basamakları', 13, 14],
    ['Asal ve Aralarında Asal Sayılar', 15, 16],
    ['Asal Çarpanlara Ayırma ve Bölen Sayısı', 17, 17],
    ['Bölme ve Bölünebilme Kuralları', 18, 21],
    ['EBOB - EKOK', 22, 25],
    ['Rasyonel Sayılar', 26, 29],
    ['Bire Bir ÖSYM 2', 30, 31],
    ['Birinci Dereceden Denklemler', 32, 34],
    ['Birinci Dereceden Eşitsizlikler', 35, 39],
    ['Mutlak Değer', 40, 43],
    ['Üslü Sayılar', 44, 48],
    ['Köklü Sayılar', 49, 53],
    ['Çarpanlara Ayırma', 54, 57],
    ['Bire Bir ÖSYM 3', 58, 60],
    ['TÜMEVARIM I', 1, 4],
    ['Oran - Orantı', 61, 64],
    ['Sayı - Kesir Problemleri', 65, 71],
    ['Yaş Problemleri', 72, 73],
    ['İşçi Problemleri', 74, 75],
    ['Bire Bir ÖSYM 4', 76, 78],
    ['Hız - Hareket Problemleri', 79, 83],
    ['Yüzde Problemleri', 84, 88],
    ['Karışım Problemleri', 89, 90],
    ['Sayısal Mantık Problemleri', 91, 94],
    ['Bire Bir ÖSYM 5', 95, 96],
    ['TÜMEVARIM II', 1, 4],
  ] as const

  const digerBolumler = [
    // 02. Kümeler
    ['Kümeler', 1, 5],
    ['Bire Bir ÖSYM', 6, 6],
    // 03. Fonksiyonlar
    ['Fonksiyonlar', 1, 13],
    ['Bire Bir ÖSYM', 14, 14],
    // 04. Veri - Sayma - Olasılık
    ['Merkezi Eğilim ve Yayılım Ölçüleri', 1, 4],
    ['Sayma, Permütasyon', 5, 10],
    ['Kombinasyon', 11, 14],
    ['Binom Açılımı', 15, 16],
    ['Olasılık', 17, 21],
    ['Bire Bir ÖSYM', 22, 23],
    ['TÜMEVARIM III', 1, 5],
    // 05. İkinci Dereceden Denklemler
    ['İkinci Dereceden Denklemler', 1, 7],
    ['Bire Bir ÖSYM', 8, 8],
    // 06. Polinomlar
    ['Polinomlar', 1, 6],
    ['Bire Bir ÖSYM', 7, 7],
    // 07. Mantık
    ['Mantık', 1, 3],
    ['Bire Bir ÖSYM', 4, 4],
    ['TÜMEVARIM IV', 1, 6],
  ] as const

  const topla = (rows: readonly (readonly [string, number, number])[]) =>
    rows.reduce((sum, [, start, end]) => sum + testCountFromRange(start, end), 0)

  it('Bölüm 1 toplamı 104 takip edilebilir testtir', () => {
    // Ana akış 1-96 (96 test) + TÜMEVARIM I (4) + TÜMEVARIM II (4).
    expect(topla(bolum1)).toBe(104)
  })

  it('kitap toplamı 177 testtir', () => {
    expect(topla(bolum1) + topla(digerBolumler)).toBe(177)
  })

  it('aynı numara farklı alt bölümlerde AYRI test sayılır', () => {
    // "Temel Kavramlar Test 1-4" ile "TÜMEVARIM I Test 1-4" aynı basılı
    // numaraları taşır ama sekiz ayrı takip birimidir.
    const temel = bolum1.find(r => r[0] === 'Temel Kavramlar')!
    const tumevarim = bolum1.find(r => r[0] === 'TÜMEVARIM I')!

    expect(temel[1]).toBe(tumevarim[1])
    expect(temel[2]).toBe(tumevarim[2])
    expect(testCountFromRange(temel[1], temel[2]) + testCountFromRange(tumevarim[1], tumevarim[2])).toBe(8)
  })

  it('bölüm toplamı alt bölümlerden hesaplanır, tek satır olarak değil', () => {
    const leaves = bolum1.map(([title, start, end], i) =>
      node(title + i, i + 1, testCountFromRange(start, end), 'bolum1')
    )
    const ordered = orderLeafSections([node('bolum1', 1, 0), ...leaves])

    expect(ordered).toHaveLength(bolum1.length)
    expect(ordered.reduce((sum, s) => sum + s.testCount, 0)).toBe(104)
  })
})
