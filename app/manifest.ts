import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

// WEB UYGULAMA MANİFESTOSU (Faz 5).
//
// SORUN: öğrenci bu ekranı telefonda, neredeyse her gün açıyor — ama
// uygulama ana ekrana eklenemiyordu. Her seferinde tarayıcıyı aç, sekme
// bul ya da adresi yaz. Ürünün günlük alışkanlığa dönüşmesinin önündeki
// engel teknik değil, sadece eksik bir dosyaydı.
//
// NEDEN SERVICE WORKER YOK: çevrimdışı çalışma ayrı ve ciddi bir iştir —
// önbelleğe alınmış eski ödev listesi göstermek, hiç göstermemekten
// kötüdür (öğrenci yaptığı işi kaydettiğini sanır). Burada yapılan şey
// yalnız "ana ekrana ekle" ve tam ekran açılış. Çevrimdışı, kendi
// başına ve veri tutarlılığı düşünülerek ele alınmalı.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} — ${BRAND.tagline}`,
    short_name: BRAND.name,
    description:
      'Öğrenci takibi: hangi kitabın neresinde, bu hafta ne verildi, ne teslim edildi.',
    lang: 'tr',
    dir: 'ltr',

    // Ana ekrandan açılınca doğrudan panele düşer; oturum yoksa
    // middleware zaten /login'e yönlendirir.
    start_url: '/',
    scope: '/',

    // standalone: tarayıcı çubuğu olmadan açılır. Ürün bir araç, gezilen
    // bir site değil; adres çubuğu ekranda yer kaplamaktan başka bir şey
    // yapmıyordu.
    display: 'standalone',
    orientation: 'portrait',

    // Açılış ekranının rengi. İkonların zemini krem; açılış ekranı da aynı
    // kremle başlasın ki ikon ile splash arasında kenar çizgisi görünmesin.
    background_color: '#f6efe8',
    theme_color: '#bd4816',

    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      // Android ikonu daireye/kareye KIRPAR. Ayrı maskeli sürüm olmazsa
      // işaretin kenarları kesilir; bu yüzden güvenli alana küçültülmüş
      // ve köşe yuvarlaması olmayan bir sürüm veriliyor.
      {
        src: '/icons/maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
