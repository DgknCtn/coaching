import type { MetadataRoute } from 'next'
import { absoluteUrl, PUBLIC_ROUTES } from '@/lib/brand'

/**
 * SITEMAP.
 *
 * Liste `lib/brand.ts`teki PUBLIC_ROUTES'tan geliyor — robots.ts ile aynı
 * kaynak. Buraya elle bir yol eklemek, robots'ta unutulması demekti.
 *
 * `lastModified` derleme zamanı: içerik sayfaları statik ve yalnız yeni
 * dağıtımla değişiyor, dolayısıyla derleme anı doğru cevap. Sahte bir
 * "bugün" değeri arama motoruna her gün yalan söylerdi.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
