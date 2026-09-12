import { defineConfig } from 'vitest/config'
// `loadEnv` vitest/config'ten DEĞİL vite'tan gelir; vitest yalnız
// defineConfig'i yeniden dışa aktarıyor.
import { loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

// ORTAM DEĞİŞKENLERİ TESTLERE AKTARILIR.
//
// ============================================================
// NEDEN: 37 GÜVENLİK TESTİ SESSİZCE ATLANIYORDU
// ============================================================
// tests/tenant-isolation.test.ts, anon anahtarıyla hiçbir view'ın
// okunamadığını doğruluyor — 049'da kapatılan P0 açığının (tüm
// workspace'lerin öğrenci adlarının herkese açık olması) bekçisi bu.
//
// Test, kimlik bilgisi yoksa kendini ATLIYOR ve bu bilinçli bir karar:
// "CI'da gizli anahtar tanımlanana kadar boru hattı kırılmasın, ama
// tanımlandığı anda kendiliğinden korumaya başlasın."
//
// Ne var ki vitest `.env.local`'i KENDİLİĞİNDEN OKUMUYOR. Anahtarlar
// dosyada duruyordu, testler ise onları hiç göremiyordu. Sonuç: yerelde
// de CI'da da 37 test her koşuda atlanıyor, `npm test` yeşil yanıyor ve
// P0 açığının bekçisi olduğu sanılan testler fiilen hiçbir şey
// korumuyordu. Atlanan test, geçen test gibi görünür.
//
// `loadEnv` Vite'ın kendi yükleyicisi: .env, .env.local ve mod'a özel
// dosyaları doğru öncelikle okur. Üçüncü argüman '' — varsayılan
// VITE_ önekli değişkenlerle sınırlı kalmasın diye; burada okunan
// NEXT_PUBLIC_* değişkenleri o öneke sahip değil.
//
// GİZLİ ANAHTAR SIZDIRMAZ: yalnız testin ihtiyaç duyduğu iki değişken
// aktarılıyor. SUPABASE_SERVICE_ROLE_KEY BİLİNÇLİ OLARAK DIŞARIDA —
// testlerin RLS'i atlayan bir anahtara erişmesi, tam da ölçmeye
// çalıştıkları şeyi anlamsız kılardı.
const env = loadEnv('test', process.cwd(), '')

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
})
