import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  blogPostSchema,
  blogStatusSchema,
  blogDeleteSchema,
  firstIssue,
  adminActionLabel,
} from '@/lib/admin/action-schemas'

// ============================================================
// BLOG ŞEMALARI: ZOD SINIRLARI ↔ VERİTABANI KISITLARI
//
// NEDEN BU TEST VAR
//
// Zod burada güvenlik katmanı DEĞİL — asıl denetim RPC'de ve CHECK
// kısıtlarında (149_blog.sql). Zod'un işi yanlış girdiyi ağa çıkmadan
// yakalamak ve kullanıcıya ALAN DÜZEYİNDE Türkçe mesaj vermek.
//
// Tam bu yüzden sınırların eşit olması gerekiyor: Zod sınırı
// veritabanınınkinden GEVŞEKSE istek sunucuya gider, CHECK ihlali olur
// ve dbErrorToTr Postgres'in İngilizce mesajını "İşlem tamamlanamadı"ya
// indirir. Kullanıcı hangi alanın sorunlu olduğunu HİÇ öğrenemez.
// Zod sınırı DAHA SIKIysa da kullanıcı veritabanının kabul edeceği bir
// değeri giremez.
//
// Aşağıdaki son blok sınırları migration dosyasından OKUYARAK
// karşılaştırıyor; elle yazılmış bir kopya değil.
// ============================================================

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/149_blog.sql'), 'utf8')

/** Geçerli bir yazı — testler bunun üzerinden alan alan bozuyor. */
const gecerli = {
  slug: 'kocluk-gorusmesi-nasil-yapilir',
  title: 'Koçluk Görüşmesi Nasıl Yapılır',
  excerpt: 'Görüşmeyi yapılandırmanın en basit yolu ve kaçınılması gereken üç hata.',
  content: 'a'.repeat(60),
  category: 'koclugun-temelleri' as const,
}

describe('blogPostSchema · geçerli girdi', () => {
  it('eksiksiz yazı kabul edilir', () => {
    const parsed = blogPostSchema.safeParse(gecerli)
    expect(parsed.success, parsed.success ? '' : firstIssue(parsed.error)).toBe(true)
  })

  it('id yeni yazıda opsiyonel, düzenlemede kabul edilir', () => {
    expect(blogPostSchema.safeParse(gecerli).success).toBe(true)
    expect(
      blogPostSchema.safeParse({
        ...gecerli,
        id: '0f6d5e4c-3b2a-4190-8765-1a2b3c4d5e6f',
      }).success
    ).toBe(true)
  })

  it('SEO alanları boş bırakılabilir', () => {
    for (const seo of [{}, { seoTitle: '' }, { seoDescription: '' }, { seoTitle: '', seoDescription: '' }]) {
      const parsed = blogPostSchema.safeParse({ ...gecerli, ...seo })
      expect(parsed.success, JSON.stringify(seo)).toBe(true)
    }
  })

  it('başlık ve özet kırpılır', () => {
    const parsed = blogPostSchema.safeParse({ ...gecerli, title: '  Başlık burada  ' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.title).toBe('Başlık burada')
  })
})

describe('blogPostSchema · hata mesajları Türkçe ve alana özgü', () => {
  const hatalar: [string, Record<string, unknown>, RegExp][] = [
    ['kısa adres', { slug: 'ab' }, /Adres en az 3/],
    ['büyük harfli adres', { slug: 'Buyuk-Harf' }, /küçük harf/],
    ['Türkçe karakterli adres', { slug: 'kocluk-görüsme' }, /küçük harf/],
    ['boşluklu adres', { slug: 'iki kelime' }, /küçük harf/],
    ['tireyle başlayan adres', { slug: '-bastaki' }, /küçük harf/],
    ['kısa başlık', { title: 'ab' }, /Başlık en az 3/],
    ['kısa özet', { excerpt: 'çok kısa' }, /Özet en az 20/],
    ['kısa içerik', { content: 'kısa' }, /İçerik en az 50/],
    ['geçersiz kategori', { category: 'olmayan' }, /kategori/],
    ['kısa arama başlığı', { seoTitle: 'ab' }, /Arama başlığı en az 3/],
    ['kısa arama açıklaması', { seoDescription: 'kısa' }, /Arama açıklaması en az 20/],
  ]

  it.each(hatalar)('%s reddedilir', (_ad, bozuk, beklenen) => {
    const parsed = blogPostSchema.safeParse({ ...gecerli, ...bozuk })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(firstIssue(parsed.error)).toMatch(beklenen)
  })

  it('her hata mesajı nokta ile biter (projenin konvansiyonu)', () => {
    for (const [, bozuk] of hatalar) {
      const parsed = blogPostSchema.safeParse({ ...gecerli, ...bozuk })
      if (!parsed.success) {
        expect(firstIssue(parsed.error).endsWith('.'), firstIssue(parsed.error)).toBe(true)
      }
    }
  })
})

describe('blogStatusSchema ve blogDeleteSchema', () => {
  const id = '0f6d5e4c-3b2a-4190-8765-1a2b3c4d5e6f'
  const reason = 'Yazı hazır, yayına alınıyor.'

  it('yayın durumu ve gerekçe ile kabul edilir', () => {
    for (const status of ['draft', 'published']) {
      expect(blogStatusSchema.safeParse({ id, status, reason }).success, status).toBe(true)
    }
  })

  it('tanınmayan durum reddedilir', () => {
    const parsed = blogStatusSchema.safeParse({ id, status: 'arsiv', reason })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(firstIssue(parsed.error)).toMatch(/yayın durumu/)
  })

  it('kısa gerekçe reddedilir — yönetim kaydı 10 karakter şart koşuyor', () => {
    const parsed = blogStatusSchema.safeParse({ id, status: 'published', reason: 'kısa' })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(firstIssue(parsed.error)).toMatch(/Gerekçe en az 10/)
  })

  it('silme onay metni ister', () => {
    expect(blogDeleteSchema.safeParse({ id, confirm: '', reason }).success).toBe(false)
    expect(blogDeleteSchema.safeParse({ id, confirm: 'Başlık', reason }).success).toBe(true)
  })

  it('geçersiz id reddedilir', () => {
    expect(blogStatusSchema.safeParse({ id: 'abc', status: 'draft', reason }).success).toBe(false)
  })
})

describe('yönetim kaydı etiketleri', () => {
  it('üç blog eylemi okunur ada çevriliyor', () => {
    expect(adminActionLabel('blog.publish')).toBe('Blog yazısı yayınlandı')
    expect(adminActionLabel('blog.unpublish')).toBe('Blog yazısı geri çekildi')
    expect(adminActionLabel('blog.delete')).toBe('Blog yazısı silindi')
  })

  it('migration bu üç eylem anahtarını gerçekten yazıyor', () => {
    // Etiketi olup RPC'de yazılmayan bir anahtar ölü koddur; tersi ise
    // yönetim kaydında ham anahtarın ("blog.publish") görünmesi demek.
    for (const action of ['blog.publish', 'blog.unpublish', 'blog.delete']) {
      expect(sql, action).toContain(`'${action}'`)
    }
  })
})

// ============================================================
// ASIL İDDİA: SINIRLAR MIGRATION'DAN OKUNARAK KARŞILAŞTIRILIYOR
// ============================================================

describe('blog şemaları · sınırlar veritabanıyla aynı', () => {
  /** `length(btrim(alan)) BETWEEN a AND b` kısıtını okur. */
  function dbRange(column: string): [number, number] {
    const re = new RegExp(`${column}\\s+TEXT[^\\n]*?length\\(btrim\\(${column}\\)\\) BETWEEN (\\d+) AND (\\d+)`)
    const match = re.exec(sql)
    expect(match, `${column} için BETWEEN kısıtı bulunamadı`).not.toBeNull()
    return [Number(match![1]), Number(match![2])]
  }

  /**
   * Zod şemasının bir alanda kabul ettiği en kısa/en uzun metni arar.
   *
   * Uzunluk kısıtı tek bir aralık olduğu için kabul monoton: ikili
   * arama doğru sonucu verir. (Sınırı elle yazmak, tam da bu testin
   * yakalamak istediği kopyalama hatasını tekrarlamak olurdu.)
   */
  function zodRange(field: 'title' | 'excerpt' | 'content'): [number, number] {
    const kabul = (n: number) =>
      blogPostSchema.safeParse({ ...gecerli, [field]: 'a'.repeat(n) }).success

    let min = 1
    while (min <= 1000 && !kabul(min)) min += 1
    expect(min, `${field}: kabul edilen bir alt sınır bulunamadı`).toBeLessThanOrEqual(1000)

    // En büyük kabul edilen uzunluk: [min, 70001) aralığında ikili arama.
    let lo = min
    let hi = 70001
    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (kabul(mid)) lo = mid
      else hi = mid
    }
    return [min, lo]
  }

  it.each(['title', 'excerpt', 'content'] as const)(
    '%s sınırları Zod ve CHECK arasında eşit',
    (field) => {
      expect(zodRange(field)).toEqual(dbRange(field))
    }
  )

  it('slug uzunluk sınırı eşit', () => {
    const match = /length\(slug\) BETWEEN (\d+) AND (\d+)/.exec(sql)
    expect(match).not.toBeNull()
    const [, dbMin, dbMax] = match!

    const slugOf = (n: number) => 'a'.repeat(n)
    expect(blogPostSchema.safeParse({ ...gecerli, slug: slugOf(Number(dbMin)) }).success).toBe(true)
    expect(blogPostSchema.safeParse({ ...gecerli, slug: slugOf(Number(dbMin) - 1) }).success).toBe(false)
    expect(blogPostSchema.safeParse({ ...gecerli, slug: slugOf(Number(dbMax)) }).success).toBe(true)
    expect(blogPostSchema.safeParse({ ...gecerli, slug: slugOf(Number(dbMax) + 1) }).success).toBe(false)
  })

  it('slug biçim kuralı Zod ve CHECK arasında aynı regex', () => {
    expect(sql).toContain("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'")
    // Zod tarafı aynı kuralı uyguluyor mu — davranışla doğrula.
    expect(blogPostSchema.safeParse({ ...gecerli, slug: 'bir-iki-3' }).success).toBe(true)
    expect(blogPostSchema.safeParse({ ...gecerli, slug: 'iki--tire' }).success).toBe(false)
    expect(blogPostSchema.safeParse({ ...gecerli, slug: 'sonda-' }).success).toBe(false)
  })

  it('SEO alanlarının üst sınırları eşit', () => {
    for (const [column, field] of [
      ['seo_title', 'seoTitle'],
      ['seo_description', 'seoDescription'],
    ] as const) {
      const re = new RegExp(`length\\(btrim\\(${column}\\)\\) BETWEEN (\\d+) AND (\\d+)`)
      const match = re.exec(sql)
      expect(match, column).not.toBeNull()
      const [, min, max] = match!

      expect(
        blogPostSchema.safeParse({ ...gecerli, [field]: 'a'.repeat(Number(max)) }).success,
        `${field} üst sınır`
      ).toBe(true)
      expect(
        blogPostSchema.safeParse({ ...gecerli, [field]: 'a'.repeat(Number(max) + 1) }).success,
        `${field} üst sınır + 1`
      ).toBe(false)
      expect(
        blogPostSchema.safeParse({ ...gecerli, [field]: 'a'.repeat(Number(min) - 1) }).success,
        `${field} alt sınır - 1`
      ).toBe(false)
    }
  })
})
