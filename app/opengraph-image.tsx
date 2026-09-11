import { ImageResponse } from 'next/og'
import { BRAND } from '@/lib/brand'

/**
 * PAYLAŞIM GÖRSELİ (Open Graph / Twitter kartı).
 *
 * NEDEN KOD, NEDEN TASARIM DOSYASI DEĞİL: marka adı ve sloganı
 * lib/brand.ts'te tek kaynaktan geliyor. Statik bir PNG, ad her
 * değiştiğinde elle yeniden üretilmesi gereken ikinci bir kaynak olurdu
 * — ve pratikte güncellenmeyip eski adı gösterirdi.
 *
 * Harf tipi BİLİNÇLİ OLARAK belirtilmedi: next/og'nin gömülü yazı tipi
 * Türkçe harfleri (ğ ş ı İ ç ö ü) karşılıyor ve ek bir font dosyasını
 * derlemeye sokmuyor.
 */
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = `${BRAND.name} — ${BRAND.tagline}`

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          // Uygulamanın krem zemini ve turuncu vurgusu.
          background: 'linear-gradient(135deg, #f6efe8 0%, #ffffff 60%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '18px',
              background: '#b8430f',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '40px',
              fontWeight: 700,
            }}
          >
            {BRAND.name}
          </div>
          {/* Marka adı YALNIZ işarette yazıyor. Yanına bir kez daha
              yazıldığında "İZ İZ" okunuyordu — işaretin kendisi zaten
              kelime işareti. */}
          <div style={{ fontSize: '28px', color: '#5c5249', fontWeight: 500 }}>
            {BRAND.tagline}
          </div>
        </div>

        <div
          style={{
            fontSize: '68px',
            fontWeight: 700,
            color: '#1a1613',
            lineHeight: 1.15,
            maxWidth: '900px',
          }}
        >
          Hangi öğrenci hangi kitabın neresinde?
        </div>

        <div
          style={{
            marginTop: '32px',
            fontSize: '32px',
            color: '#5c5249',
            maxWidth: '900px',
            lineHeight: 1.4,
          }}
        >
          Bu hafta ne verildi, ne teslim edildi, kim geride kaldı — hepsi tek
          ekranda.
        </div>
      </div>
    ),
    size
  )
}
