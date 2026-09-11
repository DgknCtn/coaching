import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/brand'

/**
 * ROBOTS.TXT.
 *
 * Bugüne kadar hiç yoktu: arama motoru neyi tarayabileceğini yalnız
 * tahmin ediyordu ve sitemap'in varlığından haberi yoktu.
 *
 * NEDEN PANELLER YASAKLI: /teacher, /student, /parent ve /admin oturum
 * arkasında; tarayıcı oraya ulaşamasa da URL'leri dış bağlantılardan
 * keşfedilebiliyor ve "tarandı ama içerik yok" hataları üretiyordu.
 * Ayrıca bu yollar öğrenci id'si taşıyor — dizinde görünmeleri istenmez.
 *
 * /api ve /auth de dışarıda: bunlar sayfa değil, uç nokta.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/teacher/',
        '/student/',
        '/parent/',
        '/admin/',
        '/partner',
        '/kurulum/',
        '/erisim',
        '/invite/',
        '/update-password',
        '/forgot-password',
        '/api/',
        '/auth/',
      ],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
