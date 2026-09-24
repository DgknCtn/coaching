// ROL BAZLI İZOLASYON TESTİ İÇİN KİRACI YARDIMCISI (R8 · SEC-04)
//
// ============================================================
// NEDEN supabase-js DEĞİL, DOĞRUDAN fetch
//
// İlk yazımda `@supabase/supabase-js` kullanıldı ve Node 20'de daha
// istemci kurulurken patladı: kütüphane her `createClient` çağrısında
// bir Realtime istemcisi başlatıyor, o da native WebSocket istiyor
// (Node 22+). Testin Realtime ile hiçbir işi yok.
//
// `tenant-isolation.test.ts` zaten doğrudan `fetch` ile PostgREST'e
// gidiyor ve bu dosya o deseni sürdürüyor. Üç kazancı var:
//   - Node sürümünden bağımsız çalışır,
//   - test bağımlılığı eklemez,
//   - ürünün gerçekten kullandığı HTTP yolunu ölçer; araya kütüphane
//     davranışı girmez.
//
// ============================================================
// SERVİS ANAHTARI YOK
//
// `vitest.config.ts` servis anahtarını testlere bilerek vermiyor:
// "RLS'i atlayan bir anahtara erişmek, tam da ölçmeye çalıştıkları şeyi
// anlamsız kılardı." Burada anon anahtarla GERÇEK giriş yapılıp gerçek
// JWT alınıyor.
//
// ============================================================
// HİÇBİR HESAP OLUŞTURULMAZ
//
// `signUp` yolu bilinçli olarak yok: servis anahtarı olmadan
// oluşturulan hesap SİLİNEMEZ, yani her koşu canlıya kalıcı çöp
// bırakırdı. Hesapları insan açar, test yalnız kullanır.
//
// ============================================================
// KİRACININ KİMLİĞİ KEŞFEDİLİR, SABİT YAZILMAZ
//
// Sabit id yazmak, veritabanı tazelendiğinde testi sessizce kör
// ederdi: aradığı satır yok → boş sonuç → "izolasyon çalışıyor" gibi
// görünür.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Testler ancak HEM kimlik bilgileri HEM de açık izin varken çalışır.
 *
 * İki ayrı koşul, çünkü farklı şeyler soruyorlar: "bağlanabilir miyim"
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

export interface Sonuc<T = unknown> {
  status: number
  body: T
  /** PostgREST hata kodu (42501, PGRST116, …) — hata yoksa null. */
  code: string | null
}

export interface Tenant {
  etiket: string
  email: string
  token: string
  workspaceId: string
  /** Kiracıya ait örnek bir öğrenci — çapraz erişim denemelerinin hedefi. */
  studentId: string
  studentName: string

  /** `GET /rest/v1/<yol>` — oturumun JWT'siyle. */
  select<T = unknown>(yol: string): Promise<Sonuc<T>>
  /** `POST|PATCH|DELETE /rest/v1/<yol>` */
  write<T = unknown>(
    yontem: 'POST' | 'PATCH' | 'DELETE',
    yol: string,
    govde?: unknown
  ): Promise<Sonuc<T>>
  /** `POST /rest/v1/rpc/<ad>` */
  rpc<T = unknown>(ad: string, govde: unknown): Promise<Sonuc<T>>
}

async function oku(response: Response): Promise<{ body: unknown; code: string | null }> {
  let body: unknown = null
  try {
    const text = await response.text()
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  const code =
    body && typeof body === 'object' && 'code' in body
      ? ((body as { code?: string }).code ?? null)
      : null
  return { body, code }
}

function istemci(token: string) {
  const ortak = {
    apikey: ANON as string,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  return {
    async select<T>(yol: string): Promise<Sonuc<T>> {
      const r = await fetch(`${URL}/rest/v1/${yol}`, { headers: ortak })
      const { body, code } = await oku(r)
      return { status: r.status, body: body as T, code }
    },

    async write<T>(
      yontem: 'POST' | 'PATCH' | 'DELETE',
      yol: string,
      govde?: unknown
    ): Promise<Sonuc<T>> {
      const r = await fetch(`${URL}/rest/v1/${yol}`, {
        method: yontem,
        // `return=representation`: etkilenen satırlar geri döner, böylece
        // "kaç satır değişti" sorusu cevaplanabilir. Sessiz no-op ile
        // gerçek başarıyı ayırmanın tek yolu bu.
        headers: { ...ortak, Prefer: 'return=representation' },
        body: govde === undefined ? undefined : JSON.stringify(govde),
      })
      const { body, code } = await oku(r)
      return { status: r.status, body: body as T, code }
    },

    async rpc<T>(ad: string, govde: unknown): Promise<Sonuc<T>> {
      const r = await fetch(`${URL}/rest/v1/rpc/${ad}`, {
        method: 'POST',
        headers: ortak,
        body: JSON.stringify(govde),
      })
      const { body, code } = await oku(r)
      return { status: r.status, body: body as T, code }
    },
  }
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
  const girisYaniti = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON as string, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  const { body: girisGovde } = await oku(girisYaniti)
  const token = (girisGovde as { access_token?: string } | null)?.access_token

  if (!girisYaniti.ok || !token) {
    const mesaj =
      (girisGovde as { error_description?: string; msg?: string } | null)?.error_description ??
      (girisGovde as { msg?: string } | null)?.msg ??
      `HTTP ${girisYaniti.status}`
    throw new Error(
      `${etiket} kiracısına giriş yapılamadı (${email}): ${mesaj}. ` +
        'Hesap mevcut mu ve şifre .env.local ile eşleşiyor mu?'
    )
  }

  const c = istemci(token)

  // ERİŞİM DURUMU ÖNCE KONTROL EDİLİR.
  //
  // 107'den sonra deneme/lisans kapısı RLS'te işliyor ve deneme 3 gün
  // (099). Süresi dolmuş bir fixture'da TÜM olumlu kontroller boşalır ve
  // dosya "izolasyon bozuk" diye kırmızıya düşer — oysa sorun testin
  // kendi hesabındadır. Bu yüzden ayrı ve açık bir hata veriliyor.
  const erisim = await c.rpc<{ blocked_reason: string | null }[]>(
    'get_workspace_access_state',
    {}
  )
  const satirlar = Array.isArray(erisim.body) ? erisim.body : []
  if (satirlar.length > 0 && satirlar.every(r => r.blocked_reason)) {
    throw new Error(
      `${etiket} kiracısının erişimi engellenmiş (${satirlar[0].blocked_reason}). ` +
        'Test hesabının denemesi dolmuş olabilir; bu bir izolasyon hatası DEĞİLDİR.'
    )
  }

  // Kiracının kendi verisi. Bu sorgu BOŞ DÖNERSE test anlamsızlaşır:
  // "yabancı veri görünmüyor" iddiası, hiçbir veri görünmediğinde
  // kendiliğinden doğru olur.
  const ogrenciler = await c.select<{ id: string; full_name: string; workspace_id: string }[]>(
    'students?select=id,full_name,workspace_id&limit=1'
  )

  if (ogrenciler.code) {
    throw new Error(`${etiket}: öğrenci okunamadı — ${ogrenciler.code}`)
  }
  const liste = Array.isArray(ogrenciler.body) ? ogrenciler.body : []
  if (liste.length === 0) {
    throw new Error(
      `${etiket} kiracısında hiç öğrenci yok. Çapraz erişim testi, her iki ` +
        'kiracının da EN AZ BİR öğrencisi olmadan anlamlı sonuç üretemez.'
    )
  }

  return {
    etiket,
    email,
    token,
    workspaceId: liste[0].workspace_id,
    studentId: liste[0].id,
    studentName: liste[0].full_name,
    ...c,
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
