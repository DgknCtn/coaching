import type { NextConfig } from "next";

/**
 * Güvenlik başlıkları (Faz 1).
 *
 * Bunlar bugüne kadar hiç tanımlı değildi. Reşit olmayan öğrencilerin
 * akademik verisini işleyen bir üründe temel eksikti.
 *
 * CSP ARTIK VAR — ama nonce'suz ve bilinçli olarak.
 *
 * NEDEN NONCE DEĞİL: nonce her istekte üretilmek zorunda, bu da
 * middleware'in her sayfayı DİNAMİK render etmeye zorlaması demek.
 * Tanıtım sayfası, giriş, kayıt ve beş hukuki metin şu anda statik
 * (build çıktısında ○). Nonce'a geçmek bunların hepsini sunucu
 * render'ına çevirir; güvenlik için ödenecek bedel, ürünün en hızlı
 * sayfalarının yavaşlaması olurdu.
 *
 * NE KAZANDIRIYOR: bu kod tabanında hiç üçüncü taraf script, iframe ya
 * da <img> etiketi yok (arandı, sıfır sonuç). Dolayısıyla script-src
 * 'self' DIŞARIDAN script yüklenmesini tamamen kapatıyor — XSS'in
 * pratikteki ana taşıyıcısı bu. 'unsafe-inline' yalnız Next.js'in kendi
 * önyükleme script'i için gerekiyor ve satır içi script enjeksiyonuna
 * kapı bırakıyor; bunu da kapatmak istendiğinde doğru adım nonce
 * DEĞİL, statik sayfaların dinamikleşmesini göze alan ayrı bir karar.
 *
 * object-src 'none' ve base-uri 'self' burada asıl değeri veriyor:
 * ikisi de eklenti tabanlı ve <base> etiketiyle yapılan saldırıları
 * kesiyor ve hiçbir maliyeti yok.
 */

/**
 * Supabase, tarayıcıdan DOĞRUDAN çağrılıyor (auth yenileme, realtime
 * yok ama REST var). connect-src'ye proje adresi yazılmazsa uygulama
 * giriş yapamaz hâle gelir — CSP'nin uygulamayı sessizce bozduğu
 * klasik durum. Adres derleme zamanında ortamdan okunuyor; sabit
 * yazılsaydı proje taşındığında fark edilmeden kırılırdı.
 */
const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return ''
  try {
    return new URL(raw).origin
  } catch {
    return ''
  }
})()

const csp = [
  "default-src 'self'",
  // 'unsafe-eval' YOK: Next.js üretim derlemesi buna ihtiyaç duymuyor.
  "script-src 'self' 'unsafe-inline'",
  // Tailwind ve next-themes satır içi stil yazıyor.
  "style-src 'self' 'unsafe-inline'",
  // data: — OG görseli ve ikonlar; blob: — istemcide üretilen yedek
  // dosyasının indirilmesi.
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  ["connect-src 'self'", supabaseOrigin].filter(Boolean).join(' '),
  // Ödeme sağlayıcısına form gönderimi: iyzico ödeme sayfasına POST
  // ediliyor. Yazılmazsa ödeme akışı CSP tarafından durdurulur.
  "form-action 'self' https://sandbox-api.iyzipay.com https://api.iyzipay.com https://sandbox-cpp.iyzipay.com https://cpp.iyzipay.com",
  // X-Frame-Options'ın modern karşılığı; ikisi birlikte duruyor çünkü
  // eski tarayıcılar yalnız ilkini biliyor.
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "upgrade-insecure-requests",
].join('; ')
const securityHeaders = [
  // Tarayıcının içerik türünü tahmin etmesini engeller (MIME sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Uygulama başka bir sitenin iframe'ine gömülemez — clickjacking savunması.
  { key: "X-Frame-Options", value: "DENY" },

  // Dış bağlantılara tam URL sızmasın; öğrenci id'si taşıyan yollar var.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Kullanılmayan güçlü tarayıcı yeteneklerini kapat.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },

  // HTTPS'e kilitle. Yalnız HTTPS üzerinden gönderildiğinde etkilidir,
  // yerel geliştirmede zararsızdır. `preload` BİLİNÇLİ OLARAK YOK:
  // preload listesine girmek geri alması zor bir taahhüttür ve alan adı
  // kesinleşmeden yapılmamalı.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },

  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  // Sunucu kimliğini gizle: saldırgana bedava bilgi verilmez.
  poweredByHeader: false,

  experimental: {
    // lucide-react barrel dosyasından import ediliyor (ör. `import { Check,
    // Clock3 } from 'lucide-react'`). Bu ayar olmadan geliştirme derlemesi
    // paketin tamamını çözümlemek zorunda kalıyor. Yalnız derleme/bundle
    // düzeyinde çalışır — çalışma zamanı davranışı aynıdır.
    optimizePackageImports: ["lucide-react"],

    // KİTAP HAVUZU YEDEĞİ SUNUCU EYLEMİNE METİN OLARAK GİDİYOR.
    //
    // Next.js'in varsayılan sunucu eylemi gövde sınırı 1 MB. İçe aktarma
    // arayüzü ise baştan beri 4 MB vaat ediyordu (MAX_FILE_BYTES) ve
    // 1 MB'ı aşan gerçek bir yedek denendiğinde istek PLATFORM düzeyinde
    // reddediliyordu: eylem hiç çalışmadığı için hata yakalanamıyor,
    // kullanıcı toast yerine "Bir hata oluştu" tam sayfa hatası görüyordu.
    //
    // Sınır, arayüzün vaadiyle eşitlendi. 100+ kitaplık bir havuzun JSON'u
    // birkaç yüz KB; 4 MB bunun kat kat üstünde ve dosya boyutu zaten
    // istemcide de sunucuda da ayrıca denetleniyor.
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
