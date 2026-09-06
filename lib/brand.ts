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
  tagline: 'Öğretmenler için öğrenci takip platformu',

  /**
   * İletişim adresi — fiyatlandırma bölümündeki "İletişime geç" butonu ve
   * footer bunu kullanır.
   *
   * DEĞİŞTİRİN: alan adı alındığında gerçek adresle güncellenmeli.
   * Şu an yer tutucu; e-posta kutusu yoksa buton çalışmaz.
   */
  contactEmail: 'iletisim@iz.app',

  /**
   * WhatsApp numarası — ULUSLARARASI BİÇİMDE, YALNIZ RAKAM.
   *
   * wa.me bağlantısı '+', boşluk ya da parantez kabul etmiyor; numarayı
   * burada temiz tutmak, bağlantıyı kuran her yerde ayrı ayrı
   * temizlemekten güvenli. Ekranda okunabilir hâli `phoneDisplay`.
   *
   * DEĞİŞTİRİN: yer tutucu. Yanlış numara, kullanıcıyı tanımadığı birine
   * yazmaya gönderir.
   */
  whatsapp: '905000000000',

  /** İnsanın okuyacağı hâli — footer'da bu görünür. */
  phoneDisplay: '+90 500 000 00 00',

  /** Instagram kullanıcı adı, '@' olmadan. */
  instagram: 'iz.app',

  /** Telif satırı için başlangıç yılı. */
  since: 2026,
} as const

/** `mailto:` bağlantısı — konu satırı önceden doldurulur. */
export function contactMailto(subject: string): string {
  return `mailto:${BRAND.contactEmail}?subject=${encodeURIComponent(subject)}`
}

/** WhatsApp sohbeti — ilk mesaj önceden doldurulur. */
export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${BRAND.whatsapp}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

export function instagramLink(): string {
  return `https://instagram.com/${BRAND.instagram}`
}
