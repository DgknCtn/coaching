import type { NextConfig } from "next";

/**
 * Güvenlik başlıkları (Faz 1).
 *
 * Bunlar bugüne kadar hiç tanımlı değildi. Reşit olmayan öğrencilerin
 * akademik verisini işleyen bir üründe temel eksikti.
 *
 * CSP BİLİNÇLİ OLARAK BURADA YOK. Next.js satır içi script ve stil
 * üretiyor; doğru CSP `nonce` ile middleware'de kurulur ve rapor modunda
 * bir süre izlenmeden zorlayıcıya çevrilmemelidir. Yanlış kurulmuş bir CSP
 * uygulamayı sessizce bozar. Ayrı bir adım olarak ele alınacak.
 */
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
  },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
