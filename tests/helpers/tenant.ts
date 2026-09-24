import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ROL BAZLI İZOLASYON TESTİ İÇİN KİRACI YARDIMCISI (R8 · SEC-04)
//
// ============================================================
// NEDEN SERVİS ANAHTARI YOK
//
// `vitest.config.ts` servis anahtarını testlere bilerek vermiyor:
// "RLS'i atlayan bir anahtara erişmek, tam da ölçmeye çalıştıkları şeyi
// anlamsız kılardı." Bu dosya o kararı bozmuyor — anon anahtarla GERÇEK
// giriş yapıp gerçek JWT alıyor. Yani testler ürünün kullandığı yolun
// tam olarak aynısından geçiyor.
//
// ============================================================
// HİÇBİR KAYIT OLUŞTURULMAZ
//
// Yardımcı yalnız GİRİŞ yapar. `signUp` yolu bilinçli olarak yok:
// servis anahtarı olmadan oluşturulan hesap SİLİNEMEZ, yani her koşu
// canlı veritabanına kalıcı çöp bırakırdı. Hesapları insan açar, test
// yalnız kullanır.
//
// ============================================================
// KİRACININ KİMLİĞİ KEŞFEDİLİR, SABİT YAZILMAZ
//
// `workspace_id` ve örnek kayıt id'leri testte sabit değil; her koşuda
// oturumun kendi verisinden okunuyor. Sabit id yazmak, veritabanı
// tazelendiğinde testi sessizce kör ederdi (aradığı satır yok → boş
// sonuç → "izolasyon çalışıyor" gibi görünür).

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Testler ancak HEM kimlik bilgileri HEM de açık izin varken çalışır.
 *
 * İki ayrı koşul, çünkü ikisi farklı şeyi soruyor: "bağlanabilir miyim"
 * ve "bu veritabanına giriş yapmam İSTENİYOR mu". `.env.local`'inde
 * üretim anahtarı olan bir geliştirici, bayrağı açmadıkça üretime karşı
 * giriş denemez.
 */
export const canRunTenantTests =
  !!URL &&
  !!ANON &&
  URL.startsWith('https://') &&
  !URL.includes('placeholder') &&
  ANON.length > 40 &&
  process.env.ALLOW_LIVE_RLS_TESTS === '1' &&
  !!process.env.TEST_TENANT_A_EMAIL &&
  !!process.env.TEST_TENANT_A_PASSWORD &&
  !!process.env.TEST_TENANT_B_EMAIL &&
  !!process.env.TEST_TENANT_B_PASSWORD

export interface Tenant {
  /** Bu kiracının oturumuyla konuşan istemci. */
  client: SupabaseClient
  email: string
  workspaceId: string
  /** Kiracıya ait örnek bir öğrenci — çapraz erişim denemelerinin hedefi. */
  studentId: string
  studentName: string
}

function anonClient(): SupabaseClient {
  return createClient(URL as string, ANON as string, {
    auth: {
      // İKİ KİMLİK ORTAK DEPOYU PAYLAŞAMAZ: persistSession açık kalsaydı
      // A ve B aynı storage'a yazar, ikincisi birincisini ezerdi ve test
      // farkında olmadan tek kullanıcıyla iki taraflı bir şey ölçerdi.
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Giriş yapar ve kiracının kimliğini keşfeder.
 *
 * Başarısızlıkta SESSİZCE ATLAMAZ, yüksek sesle patlar. Kendi kendini
 * kapatan bir güvenlik testi, olmayan bir güvenlik testidir —
 * `vitest.config.ts`'in başlığı tam olarak bu hatayı anlatıyor.
 */
export async function signInTenant(
  email: string,
  password: string,
  etiket: string
): Promise<Tenant> {
  const client = anonClient()

  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) {
    throw new Error(
      `${etiket} kiracısına giriş yapılamadı (${email}): ${signInError.message}. ` +
        'Hesap mevcut mu ve şifre .env.local ile eşleşiyor mu?'
    )
  }

  // ERİŞİM DURUMU ÖNCE KONTROL EDİLİR.
  //
  // 107'den sonra deneme/lisans kapısı RLS'te işliyor ve deneme 3 gün
  // (099). Süresi dolmuş bir fixture'da TÜM olumlu kontroller boşalır ve
  // dosya "izolasyon bozuk" diye kırmızıya düşer — oysa sorun testin
  // kendi hesabındadır. Bu yüzden ayrı ve açık bir hata veriliyor.
  const { data: accessRows } = await client.rpc('get_workspace_access_state')
  const blocked = (accessRows ?? []) as { blocked_reason: string | null }[]
  if (blocked.length > 0 && blocked.every(r => r.blocked_reason)) {
    throw new Error(
      `${etiket} kiracısının erişimi engellenmiş (${blocked[0].blocked_reason}). ` +
        'Test hesabının denemesi dolmuş olabilir; bu bir izolasyon hatası DEĞİLDİR.'
    )
  }

  // Kiracının kendi verisi. Bu sorgu BOŞ DÖNERSE test anlamsızlaşır:
  // "yabancı veri görünmüyor" iddiası, hiçbir veri görünmediğinde
  // kendiliğinden doğru olur.
  const { data: students, error: studentError } = await client
    .from('students')
    .select('id, full_name, workspace_id')
    .limit(1)

  if (studentError) {
    throw new Error(`${etiket}: öğrenci okunamadı — ${studentError.message}`)
  }
  if (!students || students.length === 0) {
    throw new Error(
      `${etiket} kiracısında hiç öğrenci yok. Çapraz erişim testi, her iki ` +
        'kiracının da EN AZ BİR öğrencisi olmadan anlamlı sonuç üretemez.'
    )
  }

  const student = students[0] as { id: string; full_name: string; workspace_id: string }

  return {
    client,
    email,
    workspaceId: student.workspace_id,
    studentId: student.id,
    studentName: student.full_name,
  }
}

/** `.env.local`'den iki kiracıyı da açar. */
export async function signInBothTenants(): Promise<{ a: Tenant; b: Tenant }> {
  const a = await signInTenant(
    process.env.TEST_TENANT_A_EMAIL as string,
    process.env.TEST_TENANT_A_PASSWORD as string,
    'A'
  )
  const b = await signInTenant(
    process.env.TEST_TENANT_B_EMAIL as string,
    process.env.TEST_TENANT_B_PASSWORD as string,
    'B'
  )

  // AYNI KİRACI İKİ KEZ AÇILMIŞSA TEST YALAN SÖYLER: "A, B'nin verisini
  // göremiyor" iddiası, A ile B aynı kişiyse anlamsızdır ve her koşuda
  // yeşil yanar.
  if (a.workspaceId === b.workspaceId) {
    throw new Error(
      'İki test hesabı AYNI çalışma alanına ait. Çapraz kiracı testi iki ' +
        'AYRI çalışma alanı gerektirir; aksi hâlde hiçbir şey ölçülmez.'
    )
  }

  return { a, b }
}
