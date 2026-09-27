import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// SAKLAMA SÜRESİ TEMİZLİĞİ — zamanlanmış çalışır.
//
// ============================================================
// NEDEN BİR UÇ NOKTA
// ============================================================
// 089, giriş kayıtlarındaki IP/şehir/cihaz bilgisinin 90 gün sonra
// silineceğini söyledi ve gizlilik metnine de öyle yazıldı. Ama silen
// bir şey yoktu: `purge_auth_event_ips()` tanımlıydı, çağıran yoktu.
// Yönetim paneli yalnız "temizlenmemiş kayıt var" uyarısı gösteriyordu.
//
// Yerine getirilmeyen bir saklama taahhüdü, hiç verilmemiş bir
// taahhütten kötüdür: metinde yazıyor, gerçekte olmuyor.
//
// pg_cron BU PROJEDE KURULU DEĞİL (uzantı listesi kontrol edildi:
// yalnız pg_stat_statements var), bu yüzden zamanlama uygulama
// tarafında — Vercel Cron bu ucu günde bir çağırıyor (vercel.json).
//
// ============================================================
// GÜVENLİK
// ============================================================
// Uç herkese açık bir URL'de duruyor ve middleware API yollarını
// taramıyor (her uç kendi doğrulamasını yapar). Bu yüzden yetki
// KONTROLÜ BURADA:
//
//   - CRON_SECRET tanımlı DEĞİLSE uç ÇALIŞMAZ. "Sır yoksa herkese açık"
//     davranışı, üretimde değişkeni koymayı unutmanın cezasını sessizce
//     ödemek olurdu.
//   - Vercel Cron `Authorization: Bearer <CRON_SECRET>` gönderir.
//   - Karşılaştırma SABİT SÜRELİ: uzunluk farkı ve karakter farkı
//     zamanlamadan sızmasın.
//
// İşin kendisi zararsız bir temizlik ama yetkisiz çağrı, ucun
// tekrar tekrar tetiklenip veritabanına yük bindirmesine izin verirdi.

/** Sabit süreli karşılaştırma — erken dönüş yok. */
function timingSafeEqual(a: string, b: string): boolean {
  // Uzunluk farkı tek başına sızıntıdır; ikisini de aynı uzunlukta
  // gezmek için farkı sonuca katıyoruz.
  let diff = a.length ^ b.length
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    console.error('[cron/purge-auth-events] CRON_SECRET tanımlı değil; uç kapalı.')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const header = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`

  if (!timingSafeEqual(header, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // SERVİS İSTEMCİSİ (122). Önceden oturumsuz (anon) istemci kullanılıyordu;
  // 109 anon'un fonksiyon yetkilerini kaldırınca temizlik sessizce
  // çalışmaz oldu. Bu uç, service.ts'nin tarif ettiği türden: oturumsuz,
  // sır korumalı, yalnız sunucuda çalışan bir iş. Fonksiyon artık yalnız
  // service_role ya da yöneticiye açık.
  const supabase = createServiceClient() as unknown as SupabaseClient
  const startedAt = new Date().toISOString()

  const { data, error } = await supabase.rpc('purge_auth_event_ips')

  // HER ÇALIŞMA KAYDA GEÇER (cron_runs, 122): yönetimdeki Sistem sekmesi
  // "son çalışma" ve sonucu buradan gösterir. Kayıt yazılamazsa iş yine
  // de sonucunu döner; kaydın kendisi işi bozmamalı.
  const { error: logError } = await supabase.from('cron_runs').insert({
    job: 'purge-auth-events',
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ok: !error,
    affected: typeof data === 'number' ? data : null,
    error: error ? (error.code ?? 'error').slice(0, 500) : null,
  })
  if (logError) {
    console.error('[cron/purge-auth-events] cron_runs yazılamadı:', logError.message)
  }

  if (error) {
    // SESSİZ BAŞARISIZLIK YOK. Temizlik çalışmıyorsa bunu bilmek gerekir;
    // 503 dönmek Vercel'in cron günlüğünde kırmızı bir satır bırakır.
    console.error(
      '[cron/purge-auth-events] temizlik başarısız:',
      JSON.stringify({ message: error.message })
    )
    return NextResponse.json({ error: 'purge_failed' }, { status: 503 })
  }

  const cleaned = typeof data === 'number' ? data : 0
  console.log(`[cron/purge-auth-events] temizlenen kayıt: ${cleaned}`)

  return NextResponse.json({ ok: true, cleaned, time: new Date().toISOString() })
}
