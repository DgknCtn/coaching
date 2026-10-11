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
   * footer bunu kullanır. Destek ve pilot geri bildirimi de buraya gelir.
   */
  contactEmail: 'info@matematiginmuhendisi.com',

  /**
   * WhatsApp numarası — ULUSLARARASI BİÇİMDE, YALNIZ RAKAM.
   *
   * wa.me bağlantısı '+', boşluk ya da parantez kabul etmiyor; numarayı
   * burada temiz tutmak, bağlantıyı kuran her yerde ayrı ayrı
   * temizlemekten güvenli. Ekranda okunabilir hâli `phoneDisplay`.
   *
   * null: henüz gerçek numara yok; footer bağlantıyı HİÇ göstermez.
   * Yer tutucu numara, kullanıcıyı tanımadığı birine yazmaya gönderirdi.
   */
  whatsapp: null as string | null,

  /** İnsanın okuyacağı hâli — footer'da bu görünür. */
  phoneDisplay: null as string | null,

  /** Instagram kullanıcı adı, '@' olmadan. null: hesap yok, gösterilmez. */
  instagram: null as string | null,

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

/**
 * Sitenin MUTLAK adresi — canonical, sitemap, robots ve OG etiketleri
 * için.
 *
 * NEDEN AYRI BİR YARDIMCI: `metadataBase` verilmediğinde Next.js OG ve
 * canonical URL'lerini göreli bırakıyor; Twitter/WhatsApp/LinkedIn gibi
 * paylaşım önizlemeleri göreli adresi çözemediği için görsel ve başlık
 * hiç görünmüyordu. Adresin tek kaynağı `NEXT_PUBLIC_APP_URL` — oturum
 * e-postalarında ve ödeme dönüşünde zaten o kullanılıyor; SEO'nun ayrı
 * bir alan adı değişkeni tutması, ikisinin sessizce ayrışması demekti.
 *
 * Sondaki '/' kırpılır: `new URL('/yol', base)` iki eğik çizgi üretmez
 * ama sitemap girdileri metin olarak birleştirildiğinde üretirdi.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  // Yer tutucu değil, gerçek bir varsayılan: yapılandırma eksikse bile
  // üretimde göreli URL üretmektense kendi alan adımıza düşmek doğru.
  const base = raw && raw.length > 0 ? raw : 'https://iz.app'
  return base.replace(/\/+$/, '')
}

/** Mutlak adres üretir: `absoluteUrl('/gizlilik')`. */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * ARAMA MOTORUNA AÇIK ROTALAR — sitemap ve robots aynı listeyi kullanır.
 *
 * Paneller (/teacher, /student, /parent, /admin) BİLİNÇLİ OLARAK YOK:
 * hepsi oturum arkasında, taranamaz ve taranmamalı. Bir listeyi iki
 * dosyada elle tekrarlamak, biri güncellenirken diğerinin unutulması
 * demekti.
 */
export const PUBLIC_ROUTES = [
  { path: '/', priority: 1, changeFrequency: 'weekly' as const },
  { path: '/demo', priority: 0.8, changeFrequency: 'monthly' as const },
  { path: '/login', priority: 0.5, changeFrequency: 'yearly' as const },
  { path: '/register', priority: 0.7, changeFrequency: 'yearly' as const },
  { path: '/gizlilik', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/kosullar', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/mesafeli-satis', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/on-bilgilendirme', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/iade', priority: 0.3, changeFrequency: 'yearly' as const },
] as const
