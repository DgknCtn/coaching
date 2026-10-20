import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BLOG_CATEGORIES,
  BLOG_CATEGORY_LABEL,
  BLOG_CATEGORY_OPTIONS,
  blogCategoryLabel,
  parseBlogCategory,
} from '@/lib/blog-categories'

// ============================================================
// BLOG KATEGORİLERİ: TS LİSTESİ ↔ SQL KISITI PARİTESİ
//
// NEDEN BU TEST VAR
//
// Kategori iki yerde yaşıyor ve yaşamak ZORUNDA:
//   - lib/blog-categories.ts  → arayüzdeki seçim, filtre ve etiketler
//   - 149_blog.sql CHECK      → veritabanının son savunması
//
// Ayrı tablo yerine CHECK seçilmesinin bedeli tam olarak bu: iki liste
// sessizce ayrışabilir. Ayrışmanın nasıl göründüğü de kötü — yönetici
// yeni kategoriyi seçer, kaydeder ve "İşlem tamamlanamadı" görür
// (dbErrorToTr, Postgres'in CHECK ihlali mesajını generic mesaja
// indiriyor). Sebebi ekranda HİÇ görünmez.
//
// Bu test o ayrışmayı CI'da yakalıyor: listeye kategori eklenip
// migration'a eklenmezse (ya da tersi) kırılır.
//
// Projenin "tek kaynak" kuralının aynı uygulaması:
// tests/marketing-parity.test.ts vitrin sayıları için bunu yapıyor.
// ============================================================

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/149_blog.sql'), 'utf8')

/** CHECK (category IN ('a','b',...)) içindeki değerleri çıkarır. */
function sqlCategories(): string[] {
  const block = /category\s+TEXT NOT NULL CHECK \(category IN \(([\s\S]*?)\)\)/.exec(sql)
  expect(block, 'migration içinde kategori CHECK kısıtı bulunamadı').not.toBeNull()
  return [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('blog kategorileri · TS ve SQL aynı', () => {
  it('migration kısıtı okunabildi (boş tarama hiçbir şey kanıtlamaz)', () => {
    expect(sqlCategories().length).toBeGreaterThan(0)
  })

  it('iki liste BİREBİR aynı — sıra dahil', () => {
    expect(sqlCategories()).toEqual([...BLOG_CATEGORIES])
  })

  it('her kategorinin bir etiketi var', () => {
    for (const category of BLOG_CATEGORIES) {
      expect(BLOG_CATEGORY_LABEL[category], category).toBeTruthy()
    }
  })

  it('kategori değerleri URL güvenli — Türkçe karakter ve boşluk yok', () => {
    // Değerler adres çubuğunda görünüyor (/blog?kategori=...); sonradan
    // değiştirmek paylaşılmış bağlantıları kırar.
    for (const category of BLOG_CATEGORIES) {
      expect(category, category).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('tekrarlayan kategori yok', () => {
    expect(new Set(BLOG_CATEGORIES).size).toBe(BLOG_CATEGORIES.length)
  })
})

describe('blog kategorileri · adres çubuğu denetimi', () => {
  it('geçerli kategori kendisini döndürür', () => {
    for (const category of BLOG_CATEGORIES) {
      expect(parseBlogCategory(category)).toBe(category)
    }
  })

  it('tanınmayan değer null döner — sorguya hiç geçmez', () => {
    // Adres çubuğuna elle yazılan bir şey sorguyu boşa düşürmesin
    // (app/admin/musteriler sayfasındaki whitelist kalıbı).
    for (const raw of ['', '   ', 'olmayan-kategori', 'DROP TABLE', '../../etc', null, undefined]) {
      expect(parseBlogCategory(raw), String(raw)).toBeNull()
    }
  })

  it('etiket yardımcısı tanınmayan değeri boş bırakmaz', () => {
    expect(blogCategoryLabel('koclugun-temelleri')).toBe('Koçluğun Temelleri')
    expect(blogCategoryLabel('olmayan')).toBe('olmayan')
  })

  it('seçenek listesi her kategoriyi değer+etiket olarak veriyor', () => {
    expect(BLOG_CATEGORY_OPTIONS).toHaveLength(BLOG_CATEGORIES.length)
    for (const option of BLOG_CATEGORY_OPTIONS) {
      expect(BLOG_CATEGORIES).toContain(option.value)
      expect(option.label).toBe(BLOG_CATEGORY_LABEL[option.value])
    }
  })
})
