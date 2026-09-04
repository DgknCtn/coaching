import { describe, it, expect } from 'vitest'
import {
  parseBookOutline,
  MAX_TESTS_PER_SUBSECTION,
  MAX_IMPORT_ROWS,
} from '@/lib/book-import'

describe('parseBookOutline', () => {
  it('aralıksız satırı bölüm, aralıklı satırı alt bölüm sayar', () => {
    const out = parseBookOutline(`
01. Bölüm - Temel Kavramlar
  Temel Kavramlar 1-4
  Tek-Çift Sayılar 5-8
`)
    expect(out.chapters).toHaveLength(1)
    expect(out.chapters[0].title).toBe('Bölüm - Temel Kavramlar')
    expect(out.chapters[0].subsections.map(s => s.title)).toEqual([
      'Temel Kavramlar',
      'Tek-Çift Sayılar',
    ])
    expect(out.totalTests).toBe(8)
  })

  it('tek testlik alt bölümü kabul eder', () => {
    const out = parseBookOutline('Bölüm\nAsal Sayılar 9')
    expect(out.chapters[0].subsections[0]).toMatchObject({ testStart: 9, testEnd: 9 })
    expect(out.totalTests).toBe(1)
  })

  it('başlıktaki numarayı aralık sanmaz', () => {
    // "01. Bölüm" satırının sonunda sayı YOK; başta. Bölüm olarak kalmalı.
    const out = parseBookOutline('01. Bölüm\nKümeler 1-3')
    expect(out.chapters).toHaveLength(1)
    expect(out.chapters[0].subsections).toHaveLength(1)
  })

  it('"Bölüm 2" gibi başlığı 1 testlik alt bölüme çevirmez', () => {
    // Aksi hâlde numaralı bölüm başlıkları sessizce test üretirdi.
    const out = parseBookOutline('Bölüm 2\nKümeler 1-3')
    expect(out.chapters).toHaveLength(1)
    expect(out.chapters[0].title).toBe('Bölüm 2')
    expect(out.totalTests).toBe(3)
  })

  it('içindekiler sayfasının nokta dolgusunu temizler', () => {
    const out = parseBookOutline('Bölüm\nTemel Kavramlar.............. 1-4')
    expect(out.chapters[0].subsections[0].title).toBe('Temel Kavramlar')
  })

  it('kısa çizgi dışındaki tire türlerini de aralık sayar', () => {
    const out = parseBookOutline('Bölüm\nKümeler 1–4\nMantık 5—8')
    expect(out.totalTests).toBe(8)
  })

  it('"Test 44-48" yazımını kabul eder', () => {
    const out = parseBookOutline('Bölüm\nÜslü Sayılar Test 44-48')
    expect(out.chapters[0].subsections[0]).toMatchObject({
      title: 'Üslü Sayılar',
      testStart: 44,
      testEnd: 48,
    })
  })

  it('aynı numara farklı bölümlerde tekrar edebilir', () => {
    // Şartname buna açıkça izin veriyor; ayrıştırıcı engellememeli.
    const out = parseBookOutline('Bölüm A\nTÜMEVARIM I 1-4\nBölüm B\nTemel Kavramlar 1-4')
    expect(out.issues).toHaveLength(0)
    expect(out.totalTests).toBe(8)
  })

  it('bölümsüz alt bölümü rapor eder ama diğer satırları korur', () => {
    const out = parseBookOutline('Kümeler 1-4\nBölüm\nMantık 5-8')
    expect(out.issues).toHaveLength(1)
    expect(out.issues[0].line).toBe(1)
    expect(out.totalTests).toBe(4)
  })

  it('tek bozuk satır yüzünden tüm yapıştırmayı reddetmez', () => {
    const out = parseBookOutline(`Bölüm
Kümeler 1-4
Bozuk 10-2
Mantık 5-8`)
    // 10-2 aralığı sondaki RANGE kalıbına uymadığı için ("10-2" -> end<start)
    // ya hata olur ya da hiç eşleşmez; her iki hâlde diğer ikisi girmeli.
    expect(out.totalTests).toBe(8)
    expect(out.chapters[0].subsections).toHaveLength(2)
  })

  it('alt bölüm test üst sınırını uygular', () => {
    const out = parseBookOutline(`Bölüm\nDev 1-${MAX_TESTS_PER_SUBSECTION + 1}`)
    expect(out.chapters[0].subsections).toHaveLength(0)
    expect(out.issues[0].message).toContain(String(MAX_TESTS_PER_SUBSECTION))
  })

  it('alt bölümü olmayan bölüm için uyarır ama satırı atmaz', () => {
    const out = parseBookOutline('Boş Bölüm')
    expect(out.chapters).toHaveLength(1)
    expect(out.issues).toHaveLength(1)
  })

  it('satır sınırında durur', () => {
    const lines = ['Bölüm']
    for (let i = 1; i <= MAX_IMPORT_ROWS + 20; i++) lines.push(`Alt ${i} ${i}-${i}`)
    const out = parseBookOutline(lines.join('\n'))
    const total = out.chapters.reduce((n, c) => n + c.subsections.length, 0) + out.chapters.length
    expect(total).toBeLessThanOrEqual(MAX_IMPORT_ROWS)
    expect(out.issues.some(i => i.message.includes(String(MAX_IMPORT_ROWS)))).toBe(true)
  })

  it('boş metin boş sonuç verir', () => {
    const out = parseBookOutline('\n\n   \n')
    expect(out.chapters).toHaveLength(0)
    expect(out.totalTests).toBe(0)
  })
})
