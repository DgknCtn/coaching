import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// OTURUMSUZ OKUMA İSTEMCİSİ — ÇEREZ OKUMAZ.
//
// ============================================================
// NEDEN `lib/supabase/server.ts` KULLANILMIYOR
//
// `server.ts`'teki istemci `cookies()` çağırıyor. Next.js'te `cookies()`
// çağıran bir sayfa KAÇINILMAZ OLARAK DİNAMİK render edilir: çıktı
// kullanıcıya göre değişebileceği için önbelleğe alınamaz.
//
// Blog sayfaları ise oturumdan tamamen bağımsız: yazı herkes için aynı.
// Çerez okuyan bir istemciyle veri çekmek, `revalidate` ayarını sessizce
// işlevsiz bırakır ve sitenin EN ÖNBELLEKLENEBİLİR sayfaları her
// istekte veritabanına gider. Blogun varlık sebebi arama motorundan
// gelen trafik; o trafiğin ilk isteği soğuk sorguya çarpmamalı.
//
// Dolayısıyla burada `@supabase/ssr` DEĞİL, düz `@supabase/supabase-js`
// kullanılıyor: oturum yok, çerez yok, yenileme yok.
//
// BU SERVICE-ROLE DEĞİL — anon anahtar.
//
// `lib/supabase/service.ts` ile karıştırılmamalı: o RLS'i baypas eder ve
// yalnız ödeme callback'i ile cron uçlarında kullanılır. Buradaki
// istemci anon anahtarla konuşuyor, yani veritabanının anon'a verdiği
// yetkiden fazlasını yapamaz. Blogun public okuma fonksiyonları
// (blog_list_published, blog_get_published, blog_published_slugs)
// tam da anon'a GRANT edilmiş durumda; tablo ise anon'a kapalı.
//
// KULLANIM KURALI: yalnız HERKESE AÇIK veriyi okumak için. Kullanıcıya
// özel hiçbir şey bu istemciyle okunmaz — okunamaz da, çünkü oturumu
// yok ve RLS onu oturumsuz sayar.
//
// `persistSession: false`: sunucuda saklanacak bir oturum yok ve
// varsayılan davranış bellekte gereksiz durum tutuyordu.
// ============================================================

export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Yapılandırma eksikse SESSİZCE boş liste döndürmek, blogun bir gün
  // sessizce kaybolması demekti. Hata, derleme/çalışma anında görünür.
  if (!url || !anonKey) {
    throw new Error(
      'Supabase yapılandırması eksik: NEXT_PUBLIC_SUPABASE_URL ve ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlı olmalı.'
    )
  }

  return createSupabaseClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
