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
  // 075 — ders/görüşme kayıtları: kiminle ne zaman görüşüldüğü.
  'student_service_month_view',
  'student_season_summary_view',
  // 080 — Dashboard operasyon görünümü. Haftalık yük, gecikme, bildirim
  // ve sıradaki temas TEK satırda; listeye girmeyen view, bu dosyanın
  // hiç bakmadığı view'dır.
  'student_active_flow_load_view',
  'student_next_contact_view',
  'teacher_student_operation_view',
  // 082 — satır düzeyinde ay atfı; hangi öğrenciyle ne zaman
  // görüşüldüğünü taşır.
  'student_service_session_view',
  // 085 — öğrenci × ay tahakkuk/tahsilat. Bir ailenin ödeme yapıp
  // yapmadığı, akademik veriden farklı bir mahremiyet sınıfı (066).
  'student_month_finance_view',
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
  // 066'da eklenen finans tabloları bu listeye alınmamıştı (068 · denetim
  // raporu bulgusu 1). Öğrenci ücreti ve tahsilat, kiracının en hassas
  // ticari verisi; listeye girmeyen bir tablo bu dosyanın hiç
  // bakmadığı bir tablodur.
  'student_fees',
  'finance_lessons',
  'finance_payments',
  // 074 (Ders & Görüşmeler) ve 077 (Haftalık Akış) tabloları. Bunlar
  // reşit olmayan öğrencilerin haftalık programını ve kiminle ne zaman
  // görüştüğünü taşıyor — konum ve rutin bilgisi. Listeye girmeyen bir
  // tablo, bu dosyanın hiç bakmadığı bir tablodur.
  'student_groups',
  'student_services',
  'group_sessions',
  'service_sessions',
  'weekly_flows',
  // 086 — velinin ödeme bildirimi. Tutar taşımıyor ama kimin hangi ay
  // ödeme yaptığını söylediğini taşıyor; aile mahremiyeti.
  'parent_payment_notices',
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

/**
 * Reddetme sayılan tek hata kodu: 42501 (insufficient_privilege).
 *
 * "NESNE BULUNAMADI" BİLİNÇLİ OLARAK LİSTEDE YOK (42P01, PGRST205).
 * Onları kabul etmek, korunan bir tablo yeniden adlandırıldığında ya da
 * listedeki ad yanlış yazıldığında testin SESSİZCE geçmesi demekti —
 * dosyanın kendi uyarısının ("aksi hâlde aynı açık sessizce geri gelir")
 * tam tersi. Bulunamayan bir nesne, güvenlik kanıtı değil, listenin
 * eskidiğinin işaretidir ve test bunu gürültüyle söylemeli.
 */
const DENIAL_CODES = ['42501']

function expectDenied(name: string, status: number, body: unknown) {
  // DURUM KODUNA GÜVENİLMİYOR, HATA KODUNA GÜVENİLİYOR.
  //
  // Ölçüldü: korunan nesnelerin tamamı `401 + 42501` döndürüyor,
  // OLMAYAN bir nesne ise `404 + PGRST205`. "401/403/404 gelirse geç"
  // demek, ikisini aynı kefeye koymak ve yeniden adlandırılmış bir
  // tabloyu güvenlik kanıtı saymaktı — bu testin tam da engellemek
  // için var olduğu sessiz körlük.
  const code = (body as { code?: string } | null)?.code ?? ''
  expect(
    DENIAL_CODES,
    `${name}: reddetme kanıtı yok (HTTP ${status}) — gövde: ${JSON.stringify(body).slice(0, 200)}`
  ).toContain(code)
}

async function expectDeniedResponse(name: string, response: Response) {
  const text = await response.text()
  let parsed: unknown = null
  try {
    parsed = JSON.parse(text)
  } catch {
    // gövde JSON değil: kod boş kalır, iddia anlamlı hata verir
  }
  expectDenied(name, response.status, parsed)
}

describe.skipIf(!hasLiveCredentials)('kiracı izolasyonu · anon erişimi', () => {
  it.each(LOCKED_VIEWS)('%s anon anahtarla veri döndürmez', async view => {
    const { status, body } = await anonSelect(view)

    // İki kabul edilebilir sonuç var:
    //   - 42501: GRANT yok, erişim kapıda kesiliyor (tercih edilen)
    //   - 200 + boş dizi: erişim var ama RLS hiçbir satır döndürmüyor
    // Kabul EDİLEMEZ olan iki şey: 200 + dolu dizi (sızıntı) ve
    // "nesne bulunamadı" (liste eskimiş, test aslında hiçbir şeye
    // bakmıyor).
    if (status === 200) {
      expect(Array.isArray(body)).toBe(true)
      expect(
        body,
        `${view} anon anahtarla satır döndürdü — kiracı verisi açıkta.`
      ).toHaveLength(0)
    } else {
      // `anonSelect` gövdeyi zaten okumuş; aynı kabul kuralı burada
      // ayrıştırılmış gövdeyle uygulanıyor.
      expectDenied(view, status, body)
    }
  })

  it.each(LOCKED_TABLES)('%s anon anahtarla veri döndürmez', async table => {
    // `select=*`, `select=id` DEĞİL.
    //
    // Eskiden `id` isteniyordu ve bu, testi iki tabloda SESSİZCE KÖR
    // ediyordu: `usage_counters` (workspace_id, feature, day, count) ve
    // `student_fees` (student_id, workspace_id, ...) tablolarında `id`
    // sütunu YOK. PostgREST sorguyu daha veriye bakmadan 42703 ("column
    // does not exist") ile reddediyordu; test bunu "erişim engellendi"
    // sanıp geçiyordu. Yani bu iki tablo okunabilir olsaydı bile test
    // haber vermezdi — kontrol ettiği şey yetki değil, yazım hatasıydı.
    //
    // `*` hem her tabloda çalışır hem de saldırganın gerçekte deneyeceği
    // sorgudur.
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=10`, {
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
      await expectDeniedResponse(table, response)
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
    // Sayı KİLİTLİ, "en az" değil: liste kazara kısalırsa test bunu
    // söylemeli. Yeni bir view eklendiğinde bu sayı da elle artar —
    // eklemeyi unutmanın maliyeti, hiç bakılmayan bir view'dır.
    expect(LOCKED_VIEWS).toHaveLength(15)
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
