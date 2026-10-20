import type { MetadataRoute } from 'next'
import { absoluteUrl, PUBLIC_ROUTES } from '@/lib/brand'
import { listPublishedSlugs } from './blog/load'

/**
 * SITEMAP.
 *
 * Statik liste `lib/brand.ts`teki PUBLIC_ROUTES'tan geliyor — robots.ts
 * ile aynı kaynak. Buraya elle bir yol eklemek, robots'ta unutulması
 * demekti.
 *
 * `lastModified` derleme zamanı: içerik sayfaları statik ve yalnız yeni
 * dağıtımla değişiyor, dolayısıyla derleme anı doğru cevap. Sahte bir
 * "bugün" değeri arama motoruna her gün yalan söylerdi.
 *
 * ============================================================
 * BLOG YAZILARI DİNAMİK — BU YÜZDEN FONKSİYON ARTIK `async`
 *
 * Yazılar panelden ekleniyor, yani derleme anında bilinmiyorlar ve
 * PUBLIC_ROUTES gibi statik bir listede yaşayamazlar. Veritabanından
 * okunuyorlar ve `lastModified` olarak yazının KENDİ `updated_at`i
 * kullanılıyor — burada derleme zamanı yanlış cevap olurdu: iki yıl
 * önce yazılmış bir yazı her dağıtımda "bugün değişti" diye bildirilir,
 * arama motoru da bir süre sonra bu sinyale güvenmeyi bırakırdı.
 *
 * OKUMA HATASI SITEMAP'İ YOK ETMİYOR: `listPublishedSlugs` hata
 * durumunda boş dizi dönüyor (app/blog/load.ts), yani statik dokuz yol
 * yine yayınlanıyor. Blog okunamadığı için var olan sayfaların da
 * dizinden düşmesi, çözdüğünden büyük bir sorun olurdu.
 * ============================================================
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date()

  const staticRoutes = PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))

  const posts = await listPublishedSlugs()

  return [
    ...staticRoutes,
    ...posts.map((post) => ({
      url: absoluteUrl(`/blog/${post.slug}`),
      lastModified: new Date(post.updated_at),
      // Yayınlanmış bir yazı nadiren değişir; 'weekly' demek arama
      // motorunu boşa tarama yapmaya davet etmek olurdu.
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ]
}
