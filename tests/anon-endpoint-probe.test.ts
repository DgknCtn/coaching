import { describe, expect, it } from 'vitest'

// SEC-01 — OTURUMSUZ YÜZEYDE 42501 KALMADIĞININ KANITI
//
// ============================================================
// NEDEN BU DOSYA VAR
//
// Dış denetimin SEC-01'i "finans / ödeme / öğrenci ücreti / denetim /
// partner nesnelerinde 42501 izin hatası" diyordu ve çözüm olarak GRANT
// öneriyordu. `baseline.md` §3 teşhisin yanlış olduğunu ölçtü: o
// tabloların anon'a kapalı olması DOĞRU ve KASITLI. Gerçek kaynak
// başkaydı — `my_workspace_ids` anon'a kapalıydı, 75 RLS politikası onu
// çağırıyordu, yani anon oturumundaki HER sorgu (korunmayan tablolarda
// bile) 42501 ile patlıyordu. 108 bunu düzeltti.
//
// Ama 108'in doğrulaması o gün ELLE ve DÖRT tabloyla yapıldı
// (`tenant-isolation.test.ts` · "anon · politika değerlendirilebiliyor").
// Bu dosya aynı iddiayı oturumsuz yüzeyin TAMAMINA yayıyor:
//
//   1. anon'un SELECT hakkı olan 38 tablonun hepsi,
//   2. RLS politikalarının çağırdığı 11 yardımcı fonksiyonun hepsi,
//   3. oturum kurulmadan çağrılan üç akış fonksiyonu.
//
// ============================================================
// KAPSAM: SEBEP, SONUÇ DEĞİL
//
// 42501 iki farklı şeyin adı olabilir:
//
//   (a) "yetkisiz erişim REDDEDİLDİ" — istenen, doğru davranış.
//       `tenant-isolation.test.ts` bunu ölçüyor ve 42501'i BAŞARI
//       sayıyor.
//   (b) "yetkili erişim DEĞERLENDİRİLEMEDİ" — RLS politikasındaki
//       yardımcı çağrılamadığı için sorgu patlıyor. Kusur budur.
//
// Bu dosya (b)'yi ölçüyor ve 42501'i BAŞARISIZLIK sayıyor. İki dosya
// birbirinin tersi değil, tamamlayıcısı: biri kapalı olması gerekenin
// kapalı, diğeri AÇIK olması gerekenin çalışır olduğunu söylüyor.
//
// ============================================================
// CANLIYA HİÇBİR ŞEY YAZILMAZ — BİR İSTİSNA DIŞINDA
//
// Prob çağrıları bilinçli olarak ya salt okunur ya da gövdesi
// tamamlanmadan hata verecek biçimde kurgulanmıştır (geçersiz eylem
// adı, CHECK'i tutmayan olay tipi). 42501 yetki denetimi gövdeden ÖNCE
// yapılır; yani "çağırabiliyorum" kanıtı için gövdenin başarıyla
// tamamlanması gerekmiyor.
//
// TEK İSTİSNA `check_rate_limit`'in gerçek eylemle çağrıldığı prob:
// `rate_limit_counters`'a bir satır yazar. Bilinçli, çünkü 110'un
// kusuru (fonksiyon çağrılabiliyor ama gövdesi `digest` bulamıyor,
// 42883) yalnız gövde SONUNA kadar çalıştığında görünür ve o kusur iki
// ay boyunca kimseyi uyarmadı. Satır zararsız: kovası prob'a özel
// (`probe:sec-01`), gerçek kullanıcının IP/e-posta kovasına dokunmaz,
// fonksiyonun fırsatçı temizliği bir gün içinde siler.
//
// ÇALIŞTIRMA: kimlik bilgisi yoksa ATLANIR — `tenant-isolation.test.ts`
// ile aynı karar.
// ============================================================

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

/** Kusurun tek imzası. Başka hata kodları bu dosyanın konusu değil. */
const KUSUR = '42501'

interface Yanit {
  status: number
  body: unknown
  code: string | null
}

function anonBasliklar() {
  return {
    apikey: ANON_KEY as string,
    Authorization: `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function oku(response: Response): Promise<Yanit> {
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
  return { status: response.status, body, code }
}

async function anonSelect(tablo: string): Promise<Yanit> {
  // `select=*` — `select=id` DEĞİL. Bazı tablolarda `id` sütunu yok ve o
  // yolla sorulsaydı PostgREST 42703 ("column does not exist") döner,
  // test de bunu bir sonuç sanardı: yetkiyi değil yazım hatasını ölçmüş
  // olurdu. `tenant-isolation.test.ts` aynı tuzağı iki tabloda yaşadı.
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${tablo}?select=*&limit=1`, {
    headers: anonBasliklar(),
  })
  return oku(response)
}

async function anonRpc(ad: string, govde: Record<string, unknown>): Promise<Yanit> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${ad}`, {
    method: 'POST',
    headers: anonBasliklar(),
    body: JSON.stringify(govde),
  })
  return oku(response)
}

/**
 * ANON'UN SELECT HAKKI OLAN TABLOLARIN TAMAMI (canlıdan okundu,
 * 26 Eylül 2026 · `has_table_privilege('anon', oid, 'SELECT')`).
 *
 * Hepsinin RLS'i açık ve politikaları bir yardımcı fonksiyon çağırıyor.
 * Beklenen sonuç her biri için AYNI: `200` + dizi. 42501, politikanın
 * değerlendirilemediği anlamına gelir.
 *
 * LİSTEDE "KAPALI OLMASI GEREKEN" TABLOLAR DA VAR (student_day_notes,
 * student_personal_items, weekly_flows, …) ve bu bir çelişki değil:
 * onlara SELECT hakkı verilmiştir, kapıyı RLS tutar. Bu dosya "veri
 * geliyor mu" sorusunu sormuyor — onu `tenant-isolation.test.ts`
 * soruyor — yalnız "sorgu PATLIYOR mu" sorusunu soruyor.
 */
const ANON_SELECT_TABLOLARI = [
  'academic_notes',
  'academic_scopes',
  'academic_terms',
  'book_parts',
  'book_section_topics',
  'book_sections',
  'book_tests',
  'books',
  'curriculum_template_items',
  'curriculum_templates',
  'group_sessions',
  'homework_batches',
  'homework_item_notes',
  'homework_items',
  'invitations',
  'parent_student_links',
  'profiles',
  'service_sessions',
  'student_book_assignments',
  'student_book_targets',
  'student_check_in_schedules',
  'student_check_ins',
  'student_curriculum_items',
  'student_day_notes',
  'student_groups',
  'student_personal_items',
  'student_services',
  'student_topic_overrides',
  'students',
  'test_completions',
  'topic_contacts',
  'topics',
  'video_watch_marks',
  'weekly_flows',
  'weekly_plan_draft_items',
  'weekly_plan_drafts',
  'workspace_members',
  'workspaces',
] as const

/**
 * RLS POLİTİKALARININ ÇAĞIRDIĞI YARDIMCILAR.
 *
 * Liste `tests/function-grants.test.ts`'teki `ANON_IZINLI`'nin ikinci
 * kategorisiyle aynı; oradaki STATİK bekçinin canlı karşılığı bu.
 * O dosya "migration'a anon GRANT'i kaçak girmiş mi" diye bakıyor, bu
 * dosya "olması gereken GRANT canlıda gerçekten var mı" diye bakıyor.
 * Biri fazlalığı, diğeri eksiği yakalar.
 *
 * Argümanlar zararsız: NULL uuid ya da boş rol dizisi. Hepsi salt
 * okunur; NULL'la çağrıldıklarında boş küme / false / NULL dönerler.
 */
const POLITIKA_YARDIMCILARI: { ad: string; args: Record<string, unknown> }[] = [
  { ad: 'can_read_library', args: {} },
  { ad: 'can_read_student', args: { p_student_id: null, p_workspace_id: null } },
  { ad: 'current_partner_id', args: {} },
  { ad: 'current_profile_id', args: {} },
  { ad: 'is_library_workspace', args: { p_workspace_id: null } },
  { ad: 'is_parent_of_student', args: { p_student_id: null } },
  { ad: 'is_student_self', args: { p_student_id: null } },
  { ad: 'is_workspace_member', args: { p_workspace_id: null } },
  { ad: 'my_member_workspace_ids', args: { p_roles: [] } },
  { ad: 'my_workspace_ids', args: { p_roles: [] } },
  { ad: 'student_workspace_matches', args: { p_student_id: null, p_workspace_id: null } },
]

describe.skipIf(!hasLiveCredentials)('SEC-01 · anon tablo yüzeyi 42501 vermiyor', () => {
  it.each(ANON_SELECT_TABLOLARI)('%s', async tablo => {
    const { status, body, code } = await anonSelect(tablo)

    expect(
      code,
      `${tablo}: anon sorgusu ${code} ile patladı. RLS politikasındaki ` +
        'yardımcı fonksiyon anon tarafından çağrılamıyor demektir (108 ' +
        'geri alınmış olabilir). Beklenen: boş sonuç, hata değil.'
    ).not.toBe(KUSUR)

    // "Hata almadım" tek başına yetmez: 404 + PGRST205 de 42501 değildir
    // ama tablonun adı değişmiş demektir ve o satır artık HİÇBİR ŞEYE
    // bakmıyordur. Durum kodu bu yüzden ayrıca iddia ediliyor.
    expect(
      status,
      `${tablo}: beklenmedik durum kodu ${status} — gövde: ${JSON.stringify(body).slice(0, 200)}`
    ).toBe(200)
    expect(Array.isArray(body)).toBe(true)
  })

  it('liste canlıdaki anon yüzeyi kadar geniş', () => {
    // 26 Eylül 2026'da anon'un SELECT hakkı olan tablo sayısı: 38.
    // Yeni bir tablo eklenip bu listeye girmezse, bu dosya ona hiç
    // bakmıyor demektir. Sayıyı elle artırmanın maliyeti, hiç
    // yoklanmayan bir tablodan düşüktür.
    expect(ANON_SELECT_TABLOLARI).toHaveLength(38)
  })
})

describe.skipIf(!hasLiveCredentials)(
  'SEC-01 · RLS yardımcıları anon tarafından çağrılabiliyor',
  () => {
    it.each(POLITIKA_YARDIMCILARI)('$ad', async ({ ad, args }) => {
      const { status, body, code } = await anonRpc(ad, args)

      expect(
        code,
        `${ad}: anon çağırdığında ${code} döndü. Bu fonksiyon RLS ` +
          'politikalarından çağrılıyor; anon çağıramazsa oturumsuz HER sorgu ' +
          `42501'e döner (108'in kapattığı kusur). Gövde: ${JSON.stringify(body).slice(0, 200)}`
      ).not.toBe(KUSUR)

      expect(status, `${ad}: beklenmedik durum kodu ${status}`).toBe(200)
    })

    it('OLUMSUZ KONTROL: anon’a kapalı bir fonksiyon 42501 veriyor', async () => {
      // BU TESTİN DİŞİ OLDUĞUNUN KANITI.
      //
      // Yukarıdaki iddiaların hepsi "42501 GELMEDİ" biçiminde. Böyle bir
      // iddia, prob hiç istek atmıyorsa ya da hata kodu artık başka bir
      // alanda dönüyorsa da doğrudur — güvenlik testlerinin en sinsi
      // başarısızlık biçimi (`cross-tenant.test.ts`'in başlığı).
      //
      // `workspace_access_ok` anon'a KAPALI (109 sonrası ölçüldü) ve
      // RLS politikalarından doğrudan çağrılmıyor — `my_workspace_ids`
      // gövdesinden, yani SECURITY DEFINER bağlamında çağrılıyor, bu
      // yüzden anon'a kapalı olması bir kusur değil. Burada olumsuz
      // kontrol olarak kullanılıyor: kusur GERİ KONDUĞUNDA imzanın ne
      // olduğunu canlıdan gösteriyor.
      //
      // Bu blok kırmızıya düşerse yukarıdaki 11 iddia da anlamsızdır.
      const { code } = await anonRpc('workspace_access_ok', { p_workspace_id: null })

      expect(
        code,
        'anon’a kapalı bir fonksiyon 42501 vermiyor: bu dosyanın tüm ' +
          'olumsuz iddiaları ölçüm yapmıyor demektir.'
      ).toBe(KUSUR)
    })

    it('liste function-grants.test.ts ile aynı yardımcıları sayıyor', () => {
      // O dosyadaki `ANON_IZINLI` iki kategori taşıyor: 3 oturumsuz akış
      // fonksiyonu + 11 politika yardımcısı. Buradaki liste ikinci
      // kategorinin tamamı olmalı; biri düşerse canlıda yoklanmayan bir
      // politika yardımcısı kalır.
      expect(POLITIKA_YARDIMCILARI).toHaveLength(11)
    })
  }
)

describe.skipIf(!hasLiveCredentials)('SEC-01 · oturumsuz akışlar', () => {
  it('get_invitation_by_token anon çağrıda hata vermez', async () => {
    // Davet sayfası (app/invite/[token]/page.tsx:37) OTURUMSUZ açılır.
    // Var olmayan bir özet gönderiliyor: beklenen cevap "davet yok",
    // "yetkin yok" değil.
    const { status, code } = await anonRpc('get_invitation_by_token', {
      p_token_hash: 'probe-sec-01-var-olmayan-ozet',
    })

    expect(code, `get_invitation_by_token anon çağrıda ${code} döndü`).not.toBe(KUSUR)
    expect(status).toBe(200)
  })

  it('log_auth_event anon çağrıda yetki hatası vermez', async () => {
    // Başarısız giriş denemesi de kaydedilir, yani bu fonksiyon oturum
    // KURULAMADIĞINDA çağrılır (lib/auth-audit.ts).
    //
    // GEÇERSİZ OLAY TİPİYLE çağrılıyor: `auth_events.event_type`'ın
    // CHECK kısıtı tutmaz, satır YAZILMAZ (servis anahtarıyla
    // doğrulandı: `event_type LIKE 'probe%'` → 0 satır). Yetki denetimi
    // gövdeden önce olduğu için "çağırabiliyorum" kanıtı bozulmaz —
    // canlıya çöp kayıt bırakmadan aynı şey ölçülür.
    //
    // FONKSİYON FAIL-OPEN: gövdesi `EXCEPTION WHEN OTHERS THEN RAISE
    // WARNING` ile bitiyor (093:111), yani CHECK ihlali dahil her hata
    // yutuluyor ve çağrı BAŞARILI görünüyor. Bu bilinçli bir karar
    // (denetim kaydı yazılamadı diye giriş engellenmemeli) ama sonucu
    // şu: bu prob'un ölçebildiği tek şey EXECUTE yetkisidir. 42501
    // gövdeden ÖNCE, yetki katmanında döner ve yutulamaz — testin
    // iddiası tam olarak o.
    const { code } = await anonRpc('log_auth_event', {
      p_event_type: 'probe_sec_01_gecersiz',
      p_profile_id: null,
      p_workspace_id: null,
    })

    expect(
      code,
      `log_auth_event anon çağrıda ${code} döndü — başarısız giriş ` +
        'denemeleri kaydedilemez demektir.'
    ).not.toBe(KUSUR)

    // Yutulan hata yüzünden çağrı hatasız döner; 23514 BEKLENMEZ.
    // Beklenen tam olarak bu: hata kodu yok, satır yok.
    expect(code, 'log_auth_event: beklenmeyen hata kodu').toBeNull()
  })

  it('check_rate_limit geçersiz eylemde yetki hatası değil iş hatası verir', async () => {
    // Hız sınırı giriş/kayıt/şifre sıfırlamada OTURUMSUZ çağrılır
    // (lib/rate-limit.ts:91). Bilinmeyen eylem adı fonksiyonun CASE
    // bloğunda EXCEPTION'a düşer: hiçbir sayaç artmaz.
    const { code } = await anonRpc('check_rate_limit', {
      p_action: 'probe_sec_01_bilinmeyen',
      p_subject: 'probe:sec-01',
    })

    expect(
      code,
      `check_rate_limit anon çağrıda ${code} döndü — giriş ve kayıtta ` +
        'kaba kuvvet koruması çalışmıyor demektir.'
    ).not.toBe(KUSUR)

    // P0001 = plpgsql RAISE EXCEPTION. Gelmemesi, CASE bloğunun artık
    // bilinmeyen eylemi sessizce geçirdiği anlamına gelir; o durumda
    // saldırgan kendi eylem adını uydurup sınırsız deneme yapabilir.
    expect(code, 'check_rate_limit: bilinmeyen eylem reddedilmedi').toBe('P0001')
  })

  it('check_rate_limit gövdesi sonuna kadar çalışıyor', async () => {
    // 110'UN KUSURUNUN BEKÇİSİ. O kusurda fonksiyon çağrılabiliyordu,
    // yetkiler doğruydu, tablo yerindeydi — yalnız gövdesi `digest`'i
    // bulamıyordu (42883) ve fail-open tasarım yüzünden hız sınırı iki
    // ay boyunca SESSİZCE çalışmadı. Yalnız yetkiyi yoklayan bir test o
    // kusuru göremez; gövdenin SONUCUNU okumak gerekir.
    //
    // Kova prob'a özel: gerçek kullanıcının IP/e-posta kovasına
    // dokunmaz, onun deneme bütçesini tüketmez.
    const { status, body, code } = await anonRpc('check_rate_limit', {
      p_action: 'login',
      p_subject: 'probe:sec-01',
    })

    expect(code, `check_rate_limit çalışmadı: ${code}`).toBeNull()
    expect(status).toBe(200)

    const sonuc = body as { allowed?: boolean; remaining?: number } | null
    expect(
      sonuc?.allowed,
      'check_rate_limit karar döndürmedi — gövde tamamlanmıyor ' +
        '(110: search_path içinde `extensions` var mı?).'
    ).toBe(true)
    expect(typeof sonuc?.remaining).toBe('number')
  })
})
