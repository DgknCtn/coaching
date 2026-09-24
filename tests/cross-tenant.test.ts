import { describe, it, expect, beforeAll } from 'vitest'
import { canRunTenantTests, signInBothTenants, type Tenant } from './helpers/tenant'

// ÇAPRAZ KİRACI İZOLASYONU — GERÇEK OTURUMLARLA (R8 · SEC-04)
//
// ============================================================
// NEDEN BU DOSYA VAR
//
// `tenant-isolation.test.ts` yalnız ANON rolünü deniyor ve bunu kendisi
// yazıyor: "NE TEST ETMEZ: iki KİMLİĞİ DOĞRULANMIŞ kullanıcı arasındaki
// izolasyon."
//
// Dış denetimin SEC-04'ü tam olarak o boşluğu istiyor ve şu cümleyle
// bitiriyor: *"UI hiding is not an authorization control."* Arayüzün
// yabancı veriyi göstermemesi bir kanıt değil; kanıt, veritabanının
// onu VERMEMESİDİR.
//
// ============================================================
// EN KRİTİK TASARIM KARARI: HER OLUMSUZ İDDİANIN EŞLENİK OLUMLU
// KONTROLÜ VAR
//
// RLS okumada HATA VERMEZ, satırı sessizce süzer. Yani "yabancı veri
// gelmedi" iddiası, veritabanı boşsa, kimlik bilgileri yanlışsa ya da
// sorgu hatalıysa da doğrudur. Böyle bir test hiçbir şey ölçmeden
// yeşil yanar — güvenlik testlerinin en sinsi başarısızlık biçimi.
//
// Bu yüzden her negatif iddianın yanında, AYNI sorgunun kendi kiracıda
// DOLU döndüğünü gösteren bir pozitif kontrol var. İkisi birlikte
// anlamlı: "bu sorgu veri getirebiliyor, ama yabancı kiracıda
// getirmiyor."
//
// YAZMA DENEMELERİNDE İSE SESSİZ NO-OP EN TEHLİKELİ SINIF: istemciden
// başarı gibi görünür. Tek güvenilir kanıt, DİĞER kiracının satırı
// yeniden okuyup değişmemiş bulmasıdır.
//
// ============================================================
// KOŞMA KOŞULU
//
// Kimlik bilgileri + ALLOW_LIVE_RLS_TESTS=1. İkisi de yoksa atlanır;
// ama kimlik bilgisi VARKEN giriş başarısız olursa dosya sessizce
// atlamaz, patlar (helpers/tenant.ts).
// ============================================================

describe.skipIf(!canRunTenantTests)('çapraz kiracı · gerçek oturumlar', () => {
  let a: Tenant
  let b: Tenant

  beforeAll(async () => {
    const tenants = await signInBothTenants()
    a = tenants.a
    b = tenants.b
  }, 30_000)

  // ============================================================
  // OKUMA
  // ============================================================

  it('kendi öğrencisini görebiliyor (POZİTİF KONTROL)', async () => {
    // Bu iddia olmadan aşağıdaki negatifler hiçbir şey kanıtlamaz.
    const { data, error } = await a.client
      .from('students')
      .select('id, full_name')
      .eq('id', a.studentId)

    expect(error).toBeNull()
    expect(
      data,
      'A kendi öğrencisini göremiyor — testin pozitif kontrolü çalışmıyor, ' +
        'negatif iddialar da anlamsız.'
    ).toHaveLength(1)
  })

  it("yabancı kiracının öğrencisini id ile isteyince BOŞ döner", async () => {
    const { data, error } = await a.client
      .from('students')
      .select('id, full_name')
      .eq('id', b.studentId)

    // RLS hata vermez, süzer: hata beklenmiyor, satır beklenmiyor.
    expect(error).toBeNull()
    expect(
      data,
      `A, B'nin öğrencisini (${b.studentName}) okuyabildi — kiracı izolasyonu kırık.`
    ).toHaveLength(0)
  })

  it('yabancı workspace_id ile süzünce BOŞ döner', async () => {
    // Bir öncekinden farklı yol: id yerine kiracı kimliğiyle sorgulamak.
    // Politika `workspace_id IN (SELECT my_workspace_ids(...))` üzerinden
    // çalıştığı için bu, kapının doğrudan sınanması.
    const { data, error } = await a.client
      .from('students')
      .select('id')
      .eq('workspace_id', b.workspaceId)

    expect(error).toBeNull()
    expect(data, "A, B'nin çalışma alanındaki öğrencileri listeleyebildi.").toHaveLength(0)
  })

  it('süzgeçsiz listede yalnız kendi kiracısı görünür', async () => {
    // En gerçekçi senaryo: uygulama zaten böyle sorguluyor. Buradaki
    // sızıntı, yukarıdaki iki testin kaçırabileceği bir politika
    // boşluğunu yakalar.
    const { data, error } = await a.client.from('students').select('workspace_id').limit(200)

    expect(error).toBeNull()
    const yabanci = (data ?? []).filter(
      r => (r as { workspace_id: string }).workspace_id !== a.workspaceId
    )
    expect(
      yabanci,
      `A'nın listesinde ${yabanci.length} yabancı satır var.`
    ).toHaveLength(0)
  })

  // ============================================================
  // YAZMA — sessiz no-op'a karşı çapraz okuma
  // ============================================================

  it('yabancı öğrenciyi GÜNCELLEYEMEZ ve satır değişmez', async () => {
    const yeniAd = `SIZINTI-TESTI-${Date.now()}`

    const { error } = await a.client
      .from('students')
      .update({ full_name: yeniAd })
      .eq('id', b.studentId)

    // Hata gelebilir de gelmeyebilir de: RLS eşleşen satır bulamazsa
    // güncelleme sessizce 0 satıra dokunur. O yüzden asıl kanıt aşağıda.
    if (error) {
      expect(['42501', 'PGRST116']).toContain(error.code)
    }

    // TEK GÜVENİLİR KANIT: sahibi satırı yeniden okuyor.
    const { data: kontrol } = await b.client
      .from('students')
      .select('full_name')
      .eq('id', b.studentId)
      .single()

    expect(
      (kontrol as { full_name: string } | null)?.full_name,
      "A, B'nin öğrenci adını değiştirebildi — yazma izolasyonu kırık."
    ).toBe(b.studentName)
  })

  it('yabancı kiracıya kayıt EKLEYEMEZ', async () => {
    const { error } = await a.client.from('students').insert({
      workspace_id: b.workspaceId,
      full_name: `SIZINTI-INSERT-${Date.now()}`,
    })

    // INSERT'te RLS süzmez, WITH CHECK reddeder: burada hata BEKLENİR.
    expect(
      error,
      "A, B'nin çalışma alanına öğrenci ekleyebildi — WITH CHECK koruması yok."
    ).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  it('kendi kiracısına ekleyebilir (POZİTİF KONTROL — sonra siler)', async () => {
    // Bir önceki testin anlamı buna bağlı: ekleme HER ZAMAN başarısız
    // oluyorsa (ör. kolon eksik, tablo yanlış), negatif iddia boştur.
    const ad = `IZOLASYON-POZITIF-${Date.now()}`
    const { data, error } = await a.client
      .from('students')
      .insert({ workspace_id: a.workspaceId, full_name: ad })
      .select('id')
      .single()

    expect(error, `A kendi kiracısına ekleyemedi: ${error?.message}`).toBeNull()

    const id = (data as { id: string } | null)?.id
    expect(id).toBeTruthy()

    // Test kendi çöpünü toplar: canlı veritabanında kalıcı kayıt
    // bırakmıyoruz.
    if (id) {
      const { error: silmeHatasi } = await a.client.from('students').delete().eq('id', id)
      expect(silmeHatasi, 'Test kaydı silinemedi; canlıda çöp kaldı.').toBeNull()
    }
  })

  it('yabancı öğrenciyi SİLEMEZ ve satır yerinde kalır', async () => {
    await a.client.from('students').delete().eq('id', b.studentId)

    const { data } = await b.client
      .from('students')
      .select('id')
      .eq('id', b.studentId)

    expect(data, "A, B'nin öğrencisini silebildi.").toHaveLength(1)
  })

  // ============================================================
  // RPC — gövde içindeki yetki kontrolü
  // ============================================================

  it('yabancı öğrenci üzerinde RPC çağıramaz', async () => {
    // Tablo politikaları doğru olsa bile SECURITY DEFINER bir RPC
    // kendi kontrolünü yapmıyorsa kiracı sınırı oradan delinir.
    const { error } = await a.client.rpc('add_academic_note', {
      p_student_id: b.studentId,
      p_note_text: `SIZINTI-RPC-${Date.now()}`,
      p_pinned: false,
    })

    expect(
      error,
      "A, B'nin öğrencisine akademik not yazabildi — RPC gövdesinde kiracı kontrolü yok."
    ).not.toBeNull()
  })

  // ============================================================
  // ÖĞRENCİNİN KİŞİSEL ALANI (R8 §14)
  //
  // Bu tablo öğretmene BİLE kapalı. Kendi kiracısında bile
  // okunamamalı — diğer testlerden farklı olarak burada "yabancı"
  // olmak gerekmiyor.
  // ============================================================

  it('öğretmen kendi kiracısındaki kişisel ajandayı bile göremez', async () => {
    const { data, error } = await a.client.from('student_personal_items').select('id').limit(5)

    // Politika hiç yazılmadığı için: ya yetki hatası ya boş sonuç.
    if (!error) {
      expect(
        data,
        'Öğretmen oturumu kişisel ajanda satırı okudu — §14 gizliliği kırık.'
      ).toHaveLength(0)
    }
  })
})
