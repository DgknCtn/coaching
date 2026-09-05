// Marka bilgisinin TEK kaynağı.
//
// Ürün adı önceden "KoçTakip" / "Koçluk Takip Sistemi" olarak yedi ayrı
// dosyaya dağılmıştı. İsim değiştiğinde hepsini tek tek aramak yerine
// buradan okunuyor.
//
// Not: "Koç" kelimesi bilinçli olarak isimden çıkarıldı — ürün özel ders
// öğretmenine, kursa ve dershaneye de satılabiliyor; marka koçlukla
// sınırlanmamalı.

export const BRAND = {
  /** Kısa ad — navbar, footer, e-posta metinleri. */
  name: 'İZ',

  /** Uzun ad — sayfa başlıkları ve resmî metinler. */
  fullName: 'İZ',

  /** Tek cümlelik ne olduğu. */
  tagline: 'Öğrenci takibini Excel\'den kurtaran koçluk ve ders takip platformu',

  /**
   * İletişim adresi — fiyatlandırma bölümündeki "İletişime geç" butonu ve
   * footer bunu kullanır.
   *
   * DEĞİŞTİRİN: alan adı alındığında gerçek adresle güncellenmeli.
   * Şu an yer tutucu; e-posta kutusu yoksa buton çalışmaz.
   */
  contactEmail: 'iletisim@iz.app',

  /** Telif satırı için başlangıç yılı. */
  since: 2026,
} as const

/** `mailto:` bağlantısı — konu satırı önceden doldurulur. */
export function contactMailto(subject: string): string {
  return `mailto:${BRAND.contactEmail}?subject=${encodeURIComponent(subject)}`
}
