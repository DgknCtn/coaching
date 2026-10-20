import { describe, expect, it } from 'vitest'
import { slugify, isValidSlug, SLUG_PATTERN } from '@/lib/blog-slug'

// ============================================================
// BAŞLIKTAN URL ADRESİ (SLUG)
//
// NEDEN BU TEST VAR
//
// Slug, yazının KALICI adresi: yayınlandıktan sonra değiştirmek her
// paylaşılmış bağlantıyı kırar. Yani üretildiği an doğru olmak zorunda.
//
// İki tuzak Türkçe'ye özgü ve ikisi de sessiz:
//
//   'I'.toLowerCase()        -> 'i'  (Türkçe'de 'ı' olmalıydı)
//   'ı'.normalize('NFD')     -> 'ı'  (ayrışmaz; 'ı' aksanlı i DEĞİL)
//
// Bu yüzden lib/blog-slug.ts elle yazılmış bir eşleme tablosu
// kullanıyor. Bu test o tablonun kapsamını kilitliyor: yeni bir
// harf unutulursa slug'a ASCII olmayan bir karakter sızar ve
// veritabanındaki CHECK kısıtı yazıyı reddeder — kullanıcı
// "İşlem tamamlanamadı"dan öteye bir şey görmezdi.
//
// SON İDDİA EN ÖNEMLİSİ: üretilen her slug, 149_blog.sql'deki
// regex'in AYNISINI geçmek zorunda.
// ============================================================

describe('blog slug · Türkçe karakterler', () => {
  it('Türkçe başlık ASCII slug olur', () => {
    expect(slugify('İZ ile Öğrenci Takibi Şart')).toBe('iz-ile-ogrenci-takibi-sart')
  })

  it('I, ı ve İ hepsi i olur', () => {
    expect(slugify('IŞIK')).toBe('isik')
    expect(slugify('ışık')).toBe('isik')
    expect(slugify('İstanbul')).toBe('istanbul')
    expect(slugify('Iıİi')).toBe('iiii')
  })

  it('ş ğ ü ö ç harflerinin hepsi eşlenir', () => {
    expect(slugify('şğüöç ŞĞÜÖÇ')).toBe('sguoc-sguoc')
  })

  it('Türkçe harf içeren gerçek başlıklar', () => {
    const cases: [string, string][] = [
      ['Koçluk Görüşmesi Nasıl Yapılır?', 'kocluk-gorusmesi-nasil-yapilir'],
      ['Deneme Sınavı Analizi: 5 Adım', 'deneme-sinavi-analizi-5-adim'],
      ['Veliyle İletişim — Üç Kural', 'veliyle-iletisim-uc-kural'],
      ['Öğrencinin Çalışma Düzeni', 'ogrencinin-calisma-duzeni'],
    ]
    for (const [title, expected] of cases) {
      expect(slugify(title), title).toBe(expected)
    }
  })

  it('ASCII olmayan hiçbir karakter slugda kalmaz', () => {
    const slug = slugify('Öğrenci ŞĞÜÖÇİI ışık — déjà vu ß')
    expect(slug).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('blog slug · biçim kuralları', () => {
  it('boşluk ve noktalama tek tireye iner', () => {
    expect(slugify('bir   iki')).toBe('bir-iki')
    expect(slugify('Soru? Cevap!')).toBe('soru-cevap')
    expect(slugify('a_b/c.d,e')).toBe('a-b-c-d-e')
  })

  it('baştaki ve sondaki tire kırpılır', () => {
    expect(slugify('  —Başlık—  ')).toBe('baslik')
    expect(slugify('...nokta...')).toBe('nokta')
  })

  it('emoji ve desteklenmeyen alfabeler atılır', () => {
    expect(slugify('Başlık 🚀 burada')).toBe('baslik-burada')
    expect(slugify('Привет başlık')).toBe('baslik')
  })

  it('rakamlar korunur', () => {
    expect(slugify('2026 YKS Planı')).toBe('2026-yks-plani')
  })

  it('boş ve tamamen sembolden oluşan girdi boş string döner', () => {
    // UYDURMA DEĞER ÜRETMİYOR: çağıran taraf kontrol etmek zorunda.
    // "yazi-1" gibi bir değer, kullanıcının fark etmediği bir adres olurdu.
    expect(slugify('')).toBe('')
    expect(slugify('   ')).toBe('')
    expect(slugify('!!!???')).toBe('')
    expect(slugify('🚀🚀')).toBe('')
  })

  it('120 karakterden uzun başlık kırpılır ve tireyle bitmez', () => {
    const slug = slugify('a'.repeat(200))
    expect(slug.length).toBeLessThanOrEqual(120)
    expect(slug.endsWith('-')).toBe(false)

    const uzun = slugify(Array.from({ length: 60 }, () => 'kelime').join(' '))
    expect(uzun.length).toBeLessThanOrEqual(120)
    expect(uzun.endsWith('-')).toBe(false)
  })
})

describe('blog slug · veritabanı kısıtıyla uyum', () => {
  // 149_blog.sql: CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length BETWEEN 3 AND 120)
  const BASLIKLAR = [
    'İZ ile Öğrenci Takibi Şart',
    'Koçluk Görüşmesi Nasıl Yapılır?',
    '2026 YKS Planı',
    'Veliyle İletişim — Üç Kural',
    '  —Başlık—  ',
    'Deneme Sınavı Analizi: 5 Adım',
    'a'.repeat(200),
  ]

  it.each(BASLIKLAR)('"%s" slugu veritabanı regexini geçer', (title) => {
    const slug = slugify(title)
    expect(slug).toMatch(SLUG_PATTERN)
    expect(slug.length).toBeGreaterThanOrEqual(3)
    expect(slug.length).toBeLessThanOrEqual(120)
    expect(isValidSlug(slug)).toBe(true)
  })

  it('isValidSlug geçersiz biçimleri reddeder', () => {
    const gecersiz = [
      '',
      'ab', // 3 karakterden kısa
      '-bastaki-tire',
      'sondaki-tire-',
      'iki--tire',
      'Buyuk-Harf',
      'turkce-ı',
      'bosluk var',
      'nokta.li',
      'a'.repeat(121),
    ]
    for (const slug of gecersiz) {
      expect(isValidSlug(slug), slug).toBe(false)
    }
  })

  it('isValidSlug geçerli biçimleri kabul eder', () => {
    for (const slug of ['abc', 'bir-iki-uc', '2026-yks', 'a1-b2-c3']) {
      expect(isValidSlug(slug), slug).toBe(true)
    }
  })
})
