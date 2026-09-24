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
// gelmedi" iddiası; veritabanı boşsa, kimlik bilgisi yanlışsa ya da
// sorgu hatalıysa da doğrudur. Böyle bir test hiçbir şey ölçmeden yeşil
// yanar — güvenlik testlerinin en sinsi başarısızlık biçimi.
//
// Bu yüzden her negatif iddianın yanında, AYNI sorgunun kendi kiracıda
// DOLU döndüğünü gösteren bir pozitif kontrol var. İkisi birlikte
// anlamlı: "bu sorgu veri getirebiliyor, ama yabancı kiracıda
// getirmiyor."
//
// YAZMADA SESSİZ NO-OP EN TEHLİKELİ SINIF: istemciden başarı gibi
// görünür. Tek güvenilir kanıt, DİĞER kiracının satırı yeniden okuyup
// değişmemiş bulmasıdır.
//
// ============================================================
// SIRALI ÇALIŞIR
//
// `test.concurrent` YOK: iki istemci sabit hesapları paylaşıyor ve
// aşağıdaki testler birbirinin verisine dokunuyor.
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
    const r = await a.select<unknown[]>(`students?select=id,full_name&id=eq.${a.studentId}`)

    expect(r.code).toBeNull()
    expect(
      r.body,
      'A kendi öğrencisini göremiyor — testin pozitif kontrolü çalışmıyor, ' +
        'negatif iddialar da anlamsız.'
    ).toHaveLength(1)
  })

  it('yabancı kiracının öğrencisini id ile isteyince BOŞ döner', async () => {
    const r = await a.select<unknown[]>(`students?select=id,full_name&id=eq.${b.studentId}`)

    // RLS hata vermez, süzer: hata beklenmiyor, satır beklenmiyor.
    expect(r.code).toBeNull()
    expect(
      r.body,
      `A, B'nin öğrencisini (${b.studentName}) okuyabildi — kiracı izolasyonu kırık.`
    ).toHaveLength(0)
  })

  it('yabancı workspace_id ile süzünce BOŞ döner', async () => {
    // Bir öncekinden farklı yol: id yerine kiracı kimliğiyle sorgulamak.
    // Politika `workspace_id IN (SELECT my_workspace_ids(...))` üzerinden
    // çalıştığı için bu, kapının doğrudan sınanması.
    const r = await a.select<unknown[]>(
      `students?select=id&workspace_id=eq.${b.workspaceId}`
    )

    expect(r.code).toBeNull()
    expect(r.body, "A, B'nin çalışma alanındaki öğrencileri listeleyebildi.").toHaveLength(0)
  })

  it('süzgeçsiz listede yalnız kendi kiracısı görünür', async () => {
    // En gerçekçi senaryo: uygulama zaten böyle sorguluyor. Buradaki
    // sızıntı, yukarıdaki iki testin kaçırabileceği bir politika
    // boşluğunu yakalar.
    const r = await a.select<{ workspace_id: string }[]>(
      'students?select=workspace_id&limit=200'
    )

    expect(r.code).toBeNull()
    const yabanci = (r.body ?? []).filter(x => x.workspace_id !== a.workspaceId)
    expect(yabanci, `A'nın listesinde ${yabanci.length} yabancı satır var.`).toHaveLength(0)
  })

  // ============================================================
  // YAZMA — sessiz no-op'a karşı çapraz okuma
  // ============================================================

  it('yabancı öğrenciyi GÜNCELLEYEMEZ ve satır değişmez', async () => {
    const yeniAd = `SIZINTI-TESTI-${Date.now()}`

    const r = await a.write<unknown[]>('PATCH', `students?id=eq.${b.studentId}`, {
      full_name: yeniAd,
    })

    // Hata gelebilir de gelmeyebilir de: RLS eşleşen satır bulamazsa
    // güncelleme sessizce 0 satıra dokunur. `return=representation`
    // sayesinde kaç satırın döndüğünü görebiliyoruz.
    if (!r.code) {
      expect(
        r.body,
        "A'nın güncellemesi satır döndürdü — yabancı kayda yazabildi."
      ).toHaveLength(0)
    }

    // TEK GÜVENİLİR KANIT: sahibi satırı yeniden okuyor.
    const kontrol = await b.select<{ full_name: string }[]>(
      `students?select=full_name&id=eq.${b.studentId}`
    )
    expect(
      kontrol.body?.[0]?.full_name,
      "A, B'nin öğrenci adını değiştirebildi — yazma izolasyonu kırık."
    ).toBe(b.studentName)
  })

  it('yabancı kiracıya kayıt EKLEYEMEZ', async () => {
    const r = await a.write('POST', 'students', {
      workspace_id: b.workspaceId,
      full_name: `SIZINTI-INSERT-${Date.now()}`,
    })

    // INSERT'te RLS süzmez, WITH CHECK reddeder: burada hata BEKLENİR.
    expect(
      r.code,
      "A, B'nin çalışma alanına öğrenci ekleyebildi — WITH CHECK koruması yok."
    ).toBe('42501')
  })

  it('kendi kiracısına ekleyebilir (POZİTİF KONTROL — sonra siler)', async () => {
    // Bir önceki testin anlamı buna bağlı: ekleme HER ZAMAN başarısız
    // oluyorsa (ör. zorunlu kolon eksik), negatif iddia boştur.
    const ad = `IZOLASYON-POZITIF-${Date.now()}`
    const r = await a.write<{ id: string }[]>('POST', 'students', {
      workspace_id: a.workspaceId,
      full_name: ad,
    })

    expect(r.code, `A kendi kiracısına ekleyemedi: ${r.code}`).toBeNull()
    const id = r.body?.[0]?.id
    expect(id, 'Eklenen kaydın id\'si dönmedi.').toBeTruthy()

    // Test kendi çöpünü toplar: canlı veritabanında kalıcı kayıt
    // bırakmıyoruz.
    if (id) {
      const silme = await a.write('DELETE', `students?id=eq.${id}`)
      expect(silme.code, 'Test kaydı silinemedi; canlıda çöp kaldı.').toBeNull()
    }
  })

  it('yabancı öğrenciyi SİLEMEZ ve satır yerinde kalır', async () => {
    await a.write('DELETE', `students?id=eq.${b.studentId}`)

    const kontrol = await b.select<unknown[]>(`students?select=id&id=eq.${b.studentId}`)
    expect(kontrol.body, "A, B'nin öğrencisini silebildi.").toHaveLength(1)
  })

  // ============================================================
  // RPC — gövde içindeki yetki kontrolü
  // ============================================================

  it('yabancı öğrenci üzerinde RPC çağıramaz', async () => {
    // Tablo politikaları doğru olsa bile SECURITY DEFINER bir RPC kendi
    // kontrolünü yapmıyorsa kiracı sınırı oradan delinir.
    const r = await a.rpc('add_academic_note', {
      p_student_id: b.studentId,
      p_note_text: `SIZINTI-RPC-${Date.now()}`,
      p_pinned: false,
    })

    expect(
      r.code,
      "A, B'nin öğrencisine akademik not yazabildi — RPC gövdesinde kiracı kontrolü yok."
    ).not.toBeNull()
  })

  // ============================================================
  // ÖĞRENCİNİN KİŞİSEL ALANI (R8 §14)
  //
  // Bu tablo öğretmene BİLE kapalı: 101'de öğretmen/veli için politika
  // hiç yazılmadı. Diğer testlerden farklı olarak burada "yabancı"
  // olmak gerekmiyor — kendi kiracısında bile boş dönmeli.
  // ============================================================

  it('öğretmen kendi kiracısındaki kişisel ajandayı bile göremez', async () => {
    const r = await a.select<unknown[]>('student_personal_items?select=id&limit=5')

    // Politika hiç yazılmadığı için: ya yetki hatası ya boş sonuç.
    if (!r.code) {
      expect(
        r.body,
        'Öğretmen oturumu kişisel ajanda satırı okudu — §14 gizliliği kırık.'
      ).toHaveLength(0)
    }
  })
})
