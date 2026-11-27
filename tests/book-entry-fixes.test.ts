import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { attachSubsections, chapterTestCount, outlineToRows } from '@/lib/book-entry'
import { parseBookOutline, parsePageOutline } from '@/lib/book-import'
import { bookLevelLabel } from '@/lib/book-taxonomy'
import { contactSourceLabel } from '@/lib/protection-pool'
import { unitTitle } from '@/lib/unit-labels'

// Kitap Girişi ve Konu Eşleme İyileştirmeleri (27.11.2026) — 1, 3a, 4.

describe('1 · açılır pencere taşması', () => {
  it('her pencere ekran yüksekliğiyle sınırlı ve kendi içinde kayar; alt bant yapışık', () => {
    const src = readFileSync('components/ui/dialog.tsx', 'utf8')
    expect(src).toMatch(/max-h-\[calc\(100dvh-2rem\)\]/)
    expect(src).toMatch(/overflow-y-auto/)
    expect(src).toMatch(/"sticky -bottom-4 -mx-4 -mb-4/)
  })
  it('içindekiler kutusu sınırlı; doluyken dış tıklama metni kaybettirmez', () => {
    const src = readFileSync('components/shared/book-outline-import.tsx', 'utf8')
    expect(src).toMatch(/max-h-\[40dvh\]/)
    expect(src).toMatch(/disablePointerDismissal=\{text\.trim\(\) !== ''\}/)
  })
})

describe('3a · yeni kitapta içindekilerden aktar', () => {
  const testOutline = parseBookOutline(`01. Bölüm - Temel Kavramlar
Temel Kavramlar 1-4
Tek-Çift Sayılar 5-8

02. Bölüm - Rasyonel Sayılar
Rasyonel Sayılar 9-14`)

  it('sayfa kitabı: bölüm adı ve sayfa aralığı satıra gelir; boş tek satırın yerine geçer', () => {
    const page = parsePageOutline('Üçgenler 1-56\nÇokgenler 57-98')
    const { rows, replace } = outlineToRows({ kind: 'page', sections: page.sections }, [{ title: '' }])
    expect(replace).toBe(true)
    expect(rows).toMatchObject([
      { title: 'Üçgenler', page_start: 1, page_end: 56 },
      { title: 'Çokgenler', page_start: 57, page_end: 98 },
    ])
  })
  it('test kitabı: bölüm başına toplam test; dolu formda sona eklenir', () => {
    const { rows, replace } = outlineToRows({ kind: 'test', chapters: testOutline.chapters }, [{ title: 'Giriş', test_count: 2 }])
    expect(replace).toBe(false)
    expect(rows.map(r => r.test_count)).toEqual([8, 6])
    expect(chapterTestCount(testOutline.chapters[0])).toBe(8)
  })
  it('alt bölümler satırlara adla iliştirilir; adı değişen satır içindekilerden kopar', () => {
    const titles = testOutline.chapters.map(c => ({ title: c.title }))
    const attached = attachSubsections([{ title: 'Giriş' }, ...titles], testOutline.chapters)
    expect(attached[0]).toBeNull()
    expect(attached[1]).toEqual([
      { title: 'Temel Kavramlar', test_start: 1, test_end: 4 },
      { title: 'Tek-Çift Sayılar', test_start: 5, test_end: 8 },
    ])
    expect(attached[2]).toHaveLength(1)
    const renamed = attachSubsections([{ title: 'Başka ad' }, titles[1]], testOutline.chapters)
    expect(renamed[0]).toBeNull()
    expect(renamed[1]).toHaveLength(1)
  })
})

describe('4 · küçük hatalar', () => {
  it('sayfa takipli kitap sayacı "Sayfa"', () => {
    expect(unitTitle('page')).toBe('Sayfa')
    expect(unitTitle('test')).toBe('Test')
    expect(unitTitle(null)).toBe('Test')
  })
  it('koruma havuzu kaynak sütunu takip türünü söyler', () => {
    expect(contactSourceLabel('homework', 'page')).toBe('Sayfa çalışması')
    expect(contactSourceLabel('homework', 'test')).toBe('Test çalışması')
    expect(contactSourceLabel('homework', 'mixed')).toBe('Kitap çalışması')
    expect(contactSourceLabel('homework')).toBe('Test çalışması')
    expect(contactSourceLabel('lesson', 'page')).toBe('Ders')
  })
  it('"Other" rozeti çizilmez; seviye alanı öncelikli', () => {
    expect(bookLevelLabel(null, 'Other')).toBeNull()
    expect(bookLevelLabel('', 'other')).toBeNull()
    expect(bookLevelLabel('10. Sınıf', 'Other')).toBe('10. Sınıf')
    expect(bookLevelLabel(null, 'YKS')).toBe('YKS')
    expect(bookLevelLabel('Belirtilmedi', null)).toBeNull()
  })
})
