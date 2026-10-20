import { BRAND, siteUrl, absoluteUrl } from '@/lib/brand'
import { plainText } from '@/lib/blog-markdown'

// BLOG İÇİN YAPILANDIRILMIŞ VERİ (JSON-LD).
//
// ============================================================
// NEDEN AYRI DOSYA — components/marketing/structured-data.tsx GENİŞLETİLMEDİ
//
// O dosya tanıtım sayfasının grafiğini üretiyor (Organization + WebSite
// + SoftwareApplication + FAQPage) ve YALNIZ oturumsuz ana sayfada
// render ediliyor (app/page.tsx). Blog'u oraya eklemek, her ana sayfa
// isteğinde blog verisi çekmek ya da ana sayfa grafiğini blog
// sayfalarında da basmak demekti.
//
// BAĞ KOPMUYOR: `publisher` ve `author`, ana sayfanın tanımladığı
// Organization düğümüne `@id` ile REFERANS veriyor
// ({siteUrl}/#organization). Böylece arama motoru iki sayfadaki iki
// grafiği aynı kuruma bağlıyor; kurumu ikinci kez tanımlamak
// (ve iki tanımın ayrışması) gerekmiyor.
//
// AÇIKLAMA UYDURULMUYOR: `description` yazının kendi özeti. İçerikten
// kesilmiş bir metin, sayfada yazmayan bir şeyi yapılandırılmış veriye
// koymak olurdu — Google için yaptırım sebebi.
// ============================================================

/** `<` kaçışı: metin ileride `</script>` içerse bile betikten çıkılamaz. */
function Script({ graph }: { graph: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, '\\u003c'),
      }}
    />
  )
}

/** Liste sayfası — yazıların kendisi değil, blogun varlığı bildiriliyor. */
export function BlogListStructuredData() {
  return (
    <Script
      graph={{
        '@context': 'https://schema.org',
        '@type': 'Blog',
        '@id': `${siteUrl()}/blog#blog`,
        url: absoluteUrl('/blog'),
        name: `${BRAND.name} Blog`,
        inLanguage: 'tr-TR',
        publisher: { '@id': `${siteUrl()}/#organization` },
      }}
    />
  )
}

export function BlogPostStructuredData({
  slug,
  title,
  excerpt,
  content,
  publishedAt,
  updatedAt,
  authorName,
}: {
  slug: string
  title: string
  excerpt: string
  content: string
  publishedAt: string | null
  updatedAt: string | null
  authorName: string
}) {
  const url = absoluteUrl(`/blog/${slug}`)

  return (
    <Script
      graph={{
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        '@id': `${url}#yazi`,
        url,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        headline: title,
        description: excerpt,
        inLanguage: 'tr-TR',
        // Okuyucunun gördüğü metnin uzunluğu — biçimleme işaretleri
        // sayılmıyor, çünkü onlar ekranda yok.
        wordCount: plainText(content).split(/\s+/).filter(Boolean).length,
        // Taslakta tarih olmaz; bu bileşen yalnız yayınlanmış yazıda
        // render ediliyor, yine de alan boşsa hiç yazılmıyor.
        ...(publishedAt ? { datePublished: publishedAt } : {}),
        ...(updatedAt ? { dateModified: updatedAt } : {}),
        author: { '@type': 'Organization', name: authorName, '@id': `${siteUrl()}/#organization` },
        publisher: { '@id': `${siteUrl()}/#organization` },
        isPartOf: { '@id': `${siteUrl()}/blog#blog` },
      }}
    />
  )
}
