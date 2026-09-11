import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// GRUP OTURUMU FAN-OUT — R7-04 §9
//
// NEDEN BU TEST VAR
//
// 074 `group_sessions` tablosunu ve `service_sessions.group_session_id`
// sütununu açmış ama hiçbir şey yazmıyordu: oturum üretimi bağı
// kurmuyor, fan-out RPC'si hiç yazılmamıştı. On kişilik bir grup
// dersini işaretlemek için on ayrı öğrenci ekranı açmak gerekiyordu ve
// biri unutulduğunda aylık sayacı sessizce eksik kalıyordu.
//
// Fan-out'un iki kuralı var ve ikisi de sessizce bozulabilir:
//
//   1. PASİF HİZMET GÜNCELLENMEZ. Gruptan ayrılmış bir öğrencinin
//      geçmiş oturumu grupla birlikte değişirse §5'in "geçmiş kayıtları
//      geriye dönük değiştirmez" kuralı bozulur.
//   2. "KATILMADI" İSTİSNASI EZİLMEZ. Öğretmen önce "Ali katılmadı"
//      deyip sonra grubu "Yapıldı" işaretlerse istisna korunmalı;
//      aksi hâlde işlem SIRASI veriyi belirler.
//
// Canlı veritabanı olmadan SQL çalıştırılamıyor; migration metnindeki
// koşullar okunuyor (repodaki diğer SQL testleriyle aynı yöntem).
// ============================================================

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/083_group_session_fanout.sql'),
  'utf8'
)

function fnBody(name: string): string {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(start, `${name} bulunamadı`).toBeGreaterThan(-1)
  const end = SQL.indexOf('$fn$;', start)
  expect(end, `${name} gövdesi kapanmıyor`).toBeGreaterThan(start)
  return SQL.slice(start, end)
}

describe('set_group_session_outcome · tek işlemle gruba', () => {
  const body = fnBody('set_group_session_outcome')

  it('gövde okunabildi (test boşa geçmesin)', () => {
    expect(body).toContain('service_sessions')
    expect(body.length).toBeGreaterThan(400)
  })

  it('yalnız AKTİF hizmeti olan öğrencilere yansıyor', () => {
    // Pasife alınmış hizmetin geçmiş oturumu grupla birlikte
    // güncellenmemeli: öğrenci o tarihte artık grupta değildi.
    expect(body).toMatch(/sv\.status\s*=\s*'active'/)
  })

  it('"Katılmadı" istisnası EZİLMİYOR', () => {
    // IS DISTINCT FROM FALSE: attended NULL (istisna yok) ve TRUE
    // güncellenir, FALSE olan dışarıda kalır.
    expect(body).toMatch(/ss\.attended IS DISTINCT FROM FALSE/)
  })

  it('yalnız bu grup oturumuna bağlı satırlar güncelleniyor', () => {
    expect(body).toMatch(/ss\.group_session_id\s*=\s*p_group_session_id/)
  })

  it('yetki kontrolü var', () => {
    expect(body).toMatch(/has_workspace_role\(v_group\.workspace_id/)
  })

  it('geçersiz durum reddediliyor', () => {
    expect(body).toMatch(/p_status NOT IN \('planlandi', 'yapildi', 'ertelendi', 'iptal', 'yapilmadi'\)/)
  })

  it('kaç öğrenciye yansıdığını döndürüyor', () => {
    // Sessiz bir fan-out, hiç yansımadığını da sessiz bırakırdı.
    expect(body).toMatch(/RETURN v_count/)
  })
})

describe('generate_service_sessions · grup bağını kuruyor', () => {
  const body = fnBody('generate_service_sessions')

  it('önce grup oturumu, sonra öğrenci oturumu üretiliyor', () => {
    // Ters sırada bağlanacak satır henüz yokken öğrenci kaydı NULL ile
    // açılırdı.
    const groupInsert = body.indexOf('INSERT INTO public.group_sessions')
    const sessionInsert = body.indexOf('INSERT INTO public.service_sessions')
    expect(groupInsert).toBeGreaterThan(-1)
    expect(sessionInsert).toBeGreaterThan(-1)
    expect(groupInsert).toBeLessThan(sessionInsert)
  })

  it('öğrenci satırı grup satırına bağlanıyor', () => {
    expect(body).toMatch(/group_session_id/)
    expect(body).toMatch(/gs\.group_id\s*=\s*t\.group_id\s*AND\s*gs\.planned_at\s*=\s*t\.planned_at/)
  })

  it('idempotent: iki ON CONFLICT DO NOTHING', () => {
    // Aynı ay iki kez çağrıldığında ne grup satırı ne öğrenci satırı
    // çoğalmalı; farklı öğrenciler için çağrıldığında ikincisi var olan
    // grup satırına bağlanmalı.
    const matches = body.match(/ON CONFLICT[\s\S]*?DO NOTHING/g) ?? []
    expect(matches.length).toBe(2)
  })

  it('083 öncesi satırlar geriye dönük bağlanıyor', () => {
    // group_session_id NULL kalmış eski satırları fan-out göremezdi.
    expect(body).toMatch(/ss\.group_session_id IS NULL/)
  })

  it('telafi satırları bağa karışmıyor', () => {
    expect(body).toMatch(/makeup_of_session_id IS NULL/)
  })
})

describe('set_session_attendance · yalnız grup oturumunda', () => {
  const body = fnBody('set_session_attendance')

  it('birebir oturumda reddediliyor', () => {
    // Birebir oturumda "katılmadı" ayrı bir durum değil; doğru kayıt
    // "Yapılmadı"dır ve telafi kararı ona bağlanır.
    expect(body).toMatch(/group_session_id IS NULL/)
    expect(body).toContain('RAISE EXCEPTION')
  })

  it('yetki kontrolü var', () => {
    expect(body).toMatch(/has_workspace_role\(v_row\.workspace_id/)
  })
})

describe('create_student_group', () => {
  const body = fnBody('create_student_group')

  it('boş ad reddediliyor', () => {
    expect(body).toMatch(/length\(btrim\(p_name\)\)\s*=\s*0/)
  })

  it('yetki kontrolü var', () => {
    expect(body).toMatch(/has_workspace_role\(p_workspace_id/)
  })
})

// ============================================================
// İLERİ TARİHLİ DÜZEN DEĞİŞİKLİĞİ — R7-04 §5 no.7
//
// NEDEN BU TEST VAR
//
// Kabul maddesi: "Kalıcı program değişikliği yalnız belirtilen tarihten
// sonrasını etkiliyor." Bu, bir SİLME işlemiyle uygulanıyor — eski
// desenle üretilmiş ileri tarihli 'planlandi' satırlar temizleniyor ki
// tembel üretici onları yeni desenle açsın.
//
// Silmenin sınırları yanlış çizilirse gerçekleşmiş hizmet kaydı ya da
// öğretmenin hâlâ karar vermesi gereken bir oturum yok olur. Üçü de
// sessiz veri kaybıdır:
//
//   1. Sonuçlanmış oturum silinirse hizmet geçmişi bozulur.
//   2. Geçmişte kalmış 'planlandi' silinirse "Durum güncellenmedi"
//      sorusu ortadan kalkar (§7-B).
//   3. Telafi silinirse öğretmenin tek seferlik kararı kaybolur.
// ============================================================

const FWD_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/084_service_forward_change.sql'),
  'utf8'
)

describe('update_student_service · yalnız ileriye etki', () => {
  const body = (() => {
    const start = FWD_SQL.indexOf('CREATE OR REPLACE FUNCTION public.update_student_service')
    const end = FWD_SQL.indexOf('$fn$;', start)
    return FWD_SQL.slice(start, end)
  })()

  it('gövde okunabildi (test boşa geçmesin)', () => {
    expect(body).toContain('service_sessions')
    expect(body.length).toBeGreaterThan(500)
  })

  it('yalnız SONUÇLANMAMIŞ oturum siliniyor', () => {
    expect(body).toMatch(/status\s*=\s*'planlandi'/)
  })

  it('telafi satırı silinmiyor', () => {
    expect(body).toMatch(/makeup_of_session_id IS NULL/)
  })

  it('kesim NOW() ile korunuyor — geçmiş silinmez', () => {
    // Yürürlük tarihi geçmişe verilse bile "Durum güncellenmedi"
    // satırları duruyor.
    expect(body).toMatch(/GREATEST\(/)
    expect(body).toMatch(/NOW\(\)/)
  })

  it('kesim YEREL takvimden hesaplanıyor', () => {
    expect(body).toMatch(/AT TIME ZONE 'Europe\/Istanbul'/)
  })

  it('hizmet eksenleri (kind / participation) DEĞİŞTİRİLMİYOR', () => {
    // Aylık sayaçlar ve ana temas önceliği bu iki eksene dayanıyor;
    // değişmesi gerekiyorsa o artık başka bir hizmettir.
    expect(body).not.toMatch(/SET[\s\S]*\bkind\s*=/)
    expect(body).not.toMatch(/participation\s*=\s*p_/)
  })

  it('kaç oturumun düştüğünü döndürüyor', () => {
    expect(body).toMatch(/RETURN v_removed/)
  })

  it('yetki kontrolü var', () => {
    expect(body).toMatch(/has_workspace_role\(v_service\.workspace_id/)
  })
})
