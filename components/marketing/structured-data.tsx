import { BRAND, siteUrl, absoluteUrl } from '@/lib/brand'
import { BASE_PER_STUDENT_MONTH_KURUS } from '@/lib/billing/pricing'

/**
 * YAPILANDIRILMIŞ VERİ (JSON-LD).
 *
 * NEDEN: arama sonucunda ürünün ne olduğu, kim tarafından sunulduğu ve
 * fiyatı ayrı bir kart olarak görünebiliyor. Bunlar sayfada zaten yazıyor
 * ama arama motoru metinden çıkarmak zorunda kalıyordu; JSON-LD aynı
 * bilgiyi tahmine yer bırakmadan veriyor.
 *
 * FİYAT UYDURULMAZ: lib/billing/pricing.ts'ten okunuyor. Sayfada bir
 * fiyat, yapılandırılmış veride başka bir fiyat olması Google tarafından
 * yaptırım sebebi — ve kullanıcıya karşı da yanlış.
 */
export function StructuredData() {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl()}/#organization`,
        name: BRAND.name,
        url: siteUrl(),
        logo: absoluteUrl('/icons/icon-512.png'),
        email: BRAND.contactEmail,
        sameAs: [`https://instagram.com/${BRAND.instagram}`],
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl()}/#website`,
        url: siteUrl(),
        name: BRAND.name,
        inLanguage: 'tr-TR',
        publisher: { '@id': `${siteUrl()}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        name: BRAND.name,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web',
        description: BRAND.tagline,
        url: siteUrl(),
        publisher: { '@id': `${siteUrl()}/#organization` },
        offers: OFFER,
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      // İçerik tamamen sunucuda, sabit verilerden üretiliyor; kullanıcı
      // girdisi yok. JSON.stringify ayrıca `<` kaçışını gerektirmeyen
      // güvenli bir çıktı veriyor.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  )
}

/**
 * Fiyat SABİT BİR TUTAR DEĞİL: öğrenci sayısı × ay üzerinden hesaplanıyor
 * (bkz. lib/billing/pricing.ts). Bu yüzden tek bir `price` yazmak yanlış
 * olurdu — `UnitPriceSpecification` tam da bunun için var: birim, "bir
 * öğrenci, bir ay".
 *
 * Kuruş tam sayısı yalnız burada, gösterim anında liraya çevriliyor.
 */
const OFFER = {
  '@type': 'Offer',
  priceCurrency: 'TRY',
  priceSpecification: {
    '@type': 'UnitPriceSpecification',
    price: String(BASE_PER_STUDENT_MONTH_KURUS / 100),
    priceCurrency: 'TRY',
    unitText: 'öğrenci/ay',
    referenceQuantity: {
      '@type': 'QuantitativeValue',
      value: 1,
      unitText: 'öğrenci/ay',
    },
  },
}
