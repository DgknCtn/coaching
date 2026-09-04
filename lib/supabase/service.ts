import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// SERVİS ROLÜ İSTEMCİSİ — RLS'İ TAMAMEN ATLAR.
//
// ============================================================
// BU DOSYA NEDEN VAR
//
// `.env.example` servis anahtarını bilinçli olarak kaldırmış ve şu notu
// bırakmıştı: "Gerçekten gerekirse yalnız o zaman ve dar kapsamla
// eklenmeli." Burası tam olarak o an.
//
// Ödeme sağlayıcısının callback'i OTURUMSUZ gelir: isteği yapan taraf
// sağlayıcının sunucusudur, kullanıcı değil. Ödemeyi kaydeden fonksiyon
// (settle_billing_order) da bilinçli olarak `authenticated` rolüne
// KAPALIDIR — açık olsaydı herkes kendi aboneliğini bedavaya açardı.
// Geriye tek meşru yol kalıyor: sunucu tarafında, imza doğrulandıktan
// sonra servis rolüyle yazmak.
//
// ============================================================
// KULLANIM KURALLARI — İHLAL EDİLİRSE RLS'İN TAMAMI ANLAMSIZLAŞIR
//
// 1. YALNIZ ödeme callback'i ve benzeri oturumsuz sunucu uçları kullanır.
//    Bir Server Component ya da Server Action bu istemciye ihtiyaç
//    duyuyorsa, neredeyse her zaman doğru cevap eksik bir RLS
//    politikasıdır — servis anahtarı değil.
//
// 2. Çağıran taraf kiracıyı KENDİ doğrular. Bu istemcide `workspace_id`
//    filtresi otomatik değildir; unutulan bir filtre, tüm kiracıların
//    verisine dokunmak demektir.
//
// 3. `import 'server-only'` yukarıda duruyor: bu dosya bir istemci
//    bileşenine sızarsa derleme kırılır. Anahtarın tarayıcıya gitmesi,
//    veritabanının tamamının herkese açılmasıdır.
//
// 4. Anahtar adı NEXT_PUBLIC_ ile BAŞLAMAZ ve başlamamalıdır.
// ============================================================

let cached: ReturnType<typeof createSupabaseClient<Database>> | null = null

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    // Sessizce anon istemciye düşmek EN TEHLİKELİ davranış olurdu:
    // ödeme kaydı sessizce yazılmaz, kullanıcı parasını öder ve
    // aboneliği açılmaz. Yapılandırma eksikse yüksek sesle patlamalı.
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY tanımlı değil; ödeme callback\'i çalışamaz.'
    )
  }

  if (cached) return cached

  cached = createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      // Servis istemcisinin oturumu yok ve olmamalı: bir kullanıcının
      // oturumunu tazelemeye kalkması, isteği o kullanıcı adına
      // yapıyormuş gibi görünmesine yol açardı.
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return cached
}
