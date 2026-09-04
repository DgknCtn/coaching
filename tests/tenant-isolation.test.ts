import { describe, expect, it } from 'vitest'

// KİRACI İZOLASYONU — canlı projeye karşı çalışan güvenlik testi.
//
// NEDEN VAR: 049'a kadar depodaki sekiz view'ın hiçbirinde
// `security_invoker` yoktu ve hiçbirinde GRANT/REVOKE tanımı yoktu. View'lar
// varsayılan olarak sahibinin haklarıyla çalıştığı için alttaki tabloların
// RLS politikalarını atlıyor, Supabase'in `public` şemasına verdiği
// varsayılan SELECT izniyle birlikte de HERKESE açık oluyorlardı.
//
// Yani tarayıcıda zaten görünen anon anahtarıyla sistemdeki TÜM
// workspace'lerin öğrenci adları okunabiliyordu. Bu açık elle fark edildi;
// bir daha elle fark edilmesini beklememek için bu dosya var.
//
// NE TEST EDER: oturum açmamış bir istemci (anon anahtar) hiçbir view'dan
// veri okuyamaz. Bu, P0 bulgusunun tam karşılığıdır ve tek bir URL + anon
// anahtarıyla çalışır — test kullanıcısı, iki workspace kurulumu veya
// servis anahtarı gerektirmez.
//
// NE TEST ETMEZ: iki KİMLİĞİ DOĞRULANMIŞ kullanıcı arasındaki izolasyon.
// Onun için iki gerçek hesap gerekir; o senaryo şimdilik elle
// doğrulanmalıdır (aşağıdaki nota bakın).
//
// ÇALIŞTIRMA: kimlik bilgisi yoksa test ATLANIR — bu bilinçli. CI'da
// gizli anahtar tanımlanana kadar boru hattı kırılmasın, ama tanımlandığı
// anda kendiliğinden korumaya başlasın.
//
//   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm test

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** Placeholder değerler CI'da build için tanımlı; onları gerçek sanmayalım. */
const hasLiveCredentials =
  !!SUPABASE_URL &&
  !!ANON_KEY &&
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('xxxxxxxx') &&
  !SUPABASE_URL.includes('placeholder') &&
  ANON_KEY.length > 40

/**
 * 049'da kilitlenen sekiz view. Yeni bir view eklendiğinde BU LİSTEYE de
 * eklenmeli — aksi hâlde aynı açık sessizce geri gelir.
 */
const LOCKED_VIEWS = [
  'student_book_progress_view',
  'student_weekly_homework_summary_view',
  'teacher_student_overview_view',
  'student_overdue_homework_view',
  'student_check_in_status_view',
  'student_pending_approval_view',
  'student_topic_contact_view',
  'student_topic_open_work_view',
] as const

/**
 * TİCARİ VE DESTEK TABLOLARI — anon'a tamamen kapalı olmalı.
 *
 * Bunlar view değil tablo ama aynı kural geçerli: oturumsuz bir istemci
 * hiçbirinden satır okuyamamalı. Lisans ve ödeme kayıtları kiracının
 * ticari verisi; destek yazışmaları serbest metin ve kişisel bilgi
 * içerebilir; partner tabloları başka partnerlerin kazancını gösterir.
 *
 * 060'ta eklenen `support_*` tabloları özellikle riskli: kullanıcı destek
 * mesajına ekran görüntüsü tarifi, e-posta, hatta şifre yazabilir.
 */
const LOCKED_TABLES = [
  'workspace_licenses',
  'billing_orders',
  'support_tickets',
  'support_messages',
  'partners',
  'partner_commissions',
  'audit_events',
  'usage_counters',
] as const

async function anonSelect(view: string) {
  const url = `${SUPABASE_URL}/rest/v1/${view}?select=workspace_id&limit=100`
  const response = await fetch(url, {
    headers: {
      apikey: ANON_KEY as string,
      Authorization: `Bearer ${ANON_KEY}`,
    },
  })

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  return { status: response.status, body }
}

describe.skipIf(!hasLiveCredentials)('kiracı izolasyonu · anon erişimi', () => {
  it.each(LOCKED_VIEWS)('%s anon anahtarla veri döndürmez', async view => {
    const { status, body } = await anonSelect(view)

    // İki kabul edilebilir sonuç var:
    //   - 401/403: GRANT kaldırılmış, erişim kapıda kesiliyor (tercih edilen)
    //   - 200 + boş dizi: erişim var ama RLS hiçbir satır döndürmüyor
    // Kabul EDİLEMEZ olan: 200 + dolu dizi.
    if (status === 200) {
      expect(Array.isArray(body)).toBe(true)
      expect(
        body,
        `${view} anon anahtarla satır döndürdü — kiracı verisi açıkta.`
      ).toHaveLength(0)
    } else {
      expect([401, 403, 404]).toContain(status)
    }
  })

  it.each(LOCKED_TABLES)('%s anon anahtarla veri döndürmez', async table => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=10`, {
      headers: {
        apikey: ANON_KEY as string,
        Authorization: `Bearer ${ANON_KEY}`,
      },
    })

    if (response.status === 200) {
      const rows = await response.json()
      expect(Array.isArray(rows)).toBe(true)
      expect(rows, `${table} anon anahtarla okunabiliyor.`).toHaveLength(0)
    } else {
      expect([401, 403, 404]).toContain(response.status)
    }
  })

  it.each([
    'admin_list_workspaces',
    'admin_list_tickets',
    'admin_list_partners',
    'admin_overview',
  ])('%s admin olmayan çağrıyı reddeder', async fn => {
    // Admin fonksiyonları girişinde is_platform_admin() kontrol ediyor
    // (060). Anon çağrı ya yetkisiz döner ya da hata verir; ASLA veri
    // döndürmemeli. Bu, "yönetici her şeyi görür" varsayılanının
    // kazara açılmadığının kanıtı.
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY as string,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })

    if (response.status === 200) {
      const rows = await response.json()
      expect(
        Array.isArray(rows) ? rows : [],
        `${fn} anon anahtarla veri döndürdü.`
      ).toHaveLength(0)
    } else {
      expect([400, 401, 403, 404]).toContain(response.status)
    }
  })

  it('anon anahtar students tablosunu da okuyamaz', async () => {
    // View'lar kapatılırken tablonun kendisi unutulmasın diye.
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/students?select=id,full_name&limit=10`,
      {
        headers: {
          apikey: ANON_KEY as string,
          Authorization: `Bearer ${ANON_KEY}`,
        },
      }
    )

    if (response.status === 200) {
      const rows = await response.json()
      expect(Array.isArray(rows)).toBe(true)
      expect(rows, 'students tablosu anon anahtarla okunabiliyor.').toHaveLength(0)
    } else {
      expect([401, 403]).toContain(response.status)
    }
  })
})

// Kimlik bilgisi yokken test paketinin sessizce boş geçmediğini göster:
// "0 test çalıştı" ile "test atlandı" farkı, bu dosyanın varlık sebebi
// kadar önemli.
describe('kiracı izolasyonu · kurulum', () => {
  it('canlı kimlik bilgisi yoksa güvenlik testi atlanır', () => {
    if (!hasLiveCredentials) {
      console.warn(
        '[tenant-isolation] NEXT_PUBLIC_SUPABASE_URL / ANON_KEY tanımlı değil — ' +
          'anon erişim testleri ATLANDI. Bu testler P0 güvenlik bulgusunu koruyor; ' +
          'CI gizli anahtarları tanımlanmalı.'
      )
    }
    expect(LOCKED_VIEWS).toHaveLength(8)
    expect(LOCKED_TABLES.length).toBeGreaterThanOrEqual(8)
  })
})

// ============================================================
// ELLE DOĞRULANACAK — otomatikleştirilmedi
//
// İki kimliği doğrulanmış kullanıcı arasındaki izolasyon:
//
//   1. İki ayrı workspace'te iki öğretmen hesabı aç (A ve B).
//   2. A ile giriş yap, tarayıcı konsolunda B'nin bir öğrenci id'siyle
//      sorgula. Boş dönmeli.
//   3. Aynısını her view için tekrarla.
//
// Bu senaryo iki gerçek hesap ve tohum veri gerektirdiği için birim test
// paketine alınmadı; Faz 2'de e2e boru hattı kurulunca oraya taşınmalı.
// ============================================================
