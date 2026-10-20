// BLOG KATEGORİLERİ — TEK KAYNAK.
//
// ============================================================
// NEDEN AYRI BİR TABLO DEĞİL
//
// Kategori, kullanıcı verisi değil PAZARLAMA KARARI: hangi konularda
// yazdığımızı biz seçiyoruz ve sayısı bir elin parmağını geçmiyor.
// Ayrı tablo + yabancı anahtar + kendi admin CRUD'u, kazandırdığının
// kat kat üstünde iş olurdu — kategori eklemek yılda bir olacak bir şey.
//
// Veritabanı tarafındaki karşılığı 149_blog.sql'deki
// `CHECK (category IN (...))`. İKİ YERİN AYRIŞMAMASI test ile
// korunuyor (tests/blog-categories.test.ts): buraya bir kategori
// eklenip migration'a eklenmezse yazı kaydedilemez ve hata
// "İşlem tamamlanamadı"ya iner — sebebi hiç görünmezdi.
//
// SLUG DEĞERLERİ URL'DE GÖRÜNÜR (/blog?kategori=koclugun-temelleri):
// Türkçe karakter ve boşluk YOK. Etiket ayrı tutuluyor çünkü URL'yi
// sonradan değiştirmek bağlantıları kırar, etiketi değiştirmek kırmaz.
// ============================================================

export const BLOG_CATEGORIES = [
  'koclugun-temelleri',
  'sinav-stratejisi',
  'veli-iletisimi',
  'urun-notlari',
] as const

export type BlogCategory = (typeof BLOG_CATEGORIES)[number]

/** Ekranda görünen ad. Değiştirmek güvenli — URL'yi etkilemez. */
export const BLOG_CATEGORY_LABEL: Record<BlogCategory, string> = {
  'koclugun-temelleri': 'Koçluğun Temelleri',
  'sinav-stratejisi': 'Sınav Stratejisi',
  'veli-iletisimi': 'Veli İletişimi',
  'urun-notlari': 'Ürün Notları',
}

/** Liste sayfasındaki filtre şeridi ve admin formundaki seçim için. */
export const BLOG_CATEGORY_OPTIONS = BLOG_CATEGORIES.map((value) => ({
  value,
  label: BLOG_CATEGORY_LABEL[value],
}))

/**
 * Adres çubuğundan gelen değeri doğrular.
 *
 * Tanınmayan değer `null` döner ve sorguya HİÇ geçmez — elle yazılmış
 * bir kategori adı sorguyu boşa düşürmesin (app/admin/musteriler
 * sayfasındaki whitelist kalıbının aynısı).
 */
export function parseBlogCategory(raw: string | undefined | null): BlogCategory | null {
  if (!raw) return null
  return (BLOG_CATEGORIES as readonly string[]).includes(raw) ? (raw as BlogCategory) : null
}

/** Etiket — tanınmayan değer için ham değeri döndürür, boş bırakmaz. */
export function blogCategoryLabel(value: string): string {
  return BLOG_CATEGORY_LABEL[value as BlogCategory] ?? value
}
