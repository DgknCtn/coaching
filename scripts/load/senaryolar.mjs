// LOAD-01 · İŞ KARIŞIMI VE KİMLİK DOĞRULAMA
//
// ============================================================
// TEK BİR SENTETİK UÇ KULLANILMAZ
//
// Denetimin §9'u bunu açıkça yasaklıyor: *"Do not use a single
// synthetic endpoint as a proxy."* Tek bir hafif uca 250 istek atmak
// "sistem 250 eşzamanlıyı kaldırıyor" gibi görünür ama hiçbir RLS
// politikası, hiçbir view, hiçbir birleştirme ölçülmemiştir.
//
// Bu yüzden karışım `operations.md` §5'te yazdığı gibi: giriş, panel,
// öğrenci listesi/detayı, Haftam, ödev, finans ve temsilî yazmalar.
// Yollar uygulamanın GERÇEKTEN kullandığı yollardır (kaynak dosya her
// senaryonun yanında yazılı).
//
// ============================================================
// NEDEN supabase-js DEĞİL, DOĞRUDAN fetch
//
// `tests/helpers/tenant.ts`'nin gerekçesi aynen geçerli: kütüphane her
// istemcide bir Realtime bağlantısı açıyor ve ölçülen HTTP yoluna kendi
// davranışını karıştırıyor. Yük testinde bu, ölçtüğün şeyin ne olduğunu
// bilmemek demek.
//
// O dosya TypeScript ve bu koşumcu bağımlılıksız çalışmak zorunda
// (derleme adımı olmadan `node scripts/load/run.mjs`), bu yüzden giriş
// mantığı burada sade biçimde yeniden yazıldı. İkisi ayrışırsa ölçüm
// yanlış yola gider; `signInTenant` değişirse buraya da bakılmalı.
//
// ============================================================
// YAZMALAR: EVET, AMA GERİ ALINABİLİR OLANLAR
//
// Salt okunur bir yük testi yanıltır: yazma yolu RLS'in `WITH CHECK`
// tarafını, tetikleyicileri ve kilitlenmeyi ölçen tek yoldur. Buradaki
// tek yazma `student_day_notes` upsert'i — kendi kiracısına, kendi
// öğrencisine, prob'a özel metinle. Staging projesinde koşulduğu için
// gerçek veriye dokunmaz; koşumcunun üretim kilidi de bunu garanti eder
// (`run.mjs`).
// ============================================================

/** Ortak: bir isteği ölç ve sınıflandır. */
async function istek(toplayici, ad, url, secenekler = {}) {
  const baslangic = performance.now()
  try {
    const yanit = await fetch(url, secenekler)
    const metin = await yanit.text()
    let govde = null
    try {
      govde = metin ? JSON.parse(metin) : null
    } catch {
      govde = null
    }
    const code =
      govde && typeof govde === 'object' && 'code' in govde ? (govde.code ?? null) : null

    toplayici.kaydet({
      ad,
      sureMs: Math.round(performance.now() - baslangic),
      status: yanit.status,
      code,
    })
    return { status: yanit.status, govde, code }
  } catch (hata) {
    // status=0 → "sunucu cevap vermedi". 5xx'ten AYRI tutuluyor: biri
    // uygulamanın hatası, diğeri ağın/kapasitenin.
    toplayici.kaydet({
      ad,
      sureMs: Math.round(performance.now() - baslangic),
      status: 0,
      code: null,
    })
    return { status: 0, govde: null, code: null, hata: String(hata) }
  }
}

/**
 * Gerçek rolle giriş yapar ve kiracının kimliğini KEŞFEDER.
 *
 * Sabit id yazılmaz: veritabanı tazelendiğinde koşumcu boş sorgulara
 * yük bindirir ve hiçbir şey ölçmez (`tests/helpers/tenant.ts`'nin aynı
 * kararı).
 */
export async function girisYap(ayar, kullanici, toplayici) {
  const yanit = await istek(toplayici, '01_giris', `${ayar.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ayar.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: kullanici.email, password: kullanici.password }),
  })

  const token = yanit.govde?.access_token
  if (!token) {
    throw new Error(
      `Giriş başarısız (${kullanici.email}): HTTP ${yanit.status}. ` +
        'Yük testi kimlik doğrulamadan koşarsa anon yüzeyi ölçer, ürünü ölçmez.'
    )
  }

  const basliklar = {
    apikey: ayar.anonKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  const ogrenciler = await istek(
    toplayici,
    '02_ogrenci_listesi',
    `${ayar.url}/rest/v1/students?select=id,full_name,workspace_id&limit=50`,
    { headers: basliklar }
  )

  const liste = Array.isArray(ogrenciler.govde) ? ogrenciler.govde : []
  if (liste.length === 0) {
    throw new Error(
      `${kullanici.email} hesabında hiç öğrenci yok. Boş kiracıya yük ` +
        'bindirmek hiçbir RLS politikasını ölçmez.'
    )
  }

  return {
    etiket: kullanici.email,
    basliklar,
    workspaceId: liste[0].workspace_id,
    ogrenciler: liste,
  }
}

/** Rastgele öğrenci — her sanal kullanıcı aynı satıra vurmasın. */
function rastgeleOgrenci(oturum) {
  return oturum.ogrenciler[Math.floor(Math.random() * oturum.ogrenciler.length)]
}

function buGun() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * TEK BİR SANAL KULLANICI TURU.
 *
 * Sıra, gerçek bir öğretmenin oturumunu taklit ediyor: panel → öğrenci
 * listesi → bir öğrencinin detayı → Haftam → ödev → finans → bir yazma.
 */
export async function tur(ayar, oturum, toplayici) {
  const ogrenci = rastgeleOgrenci(oturum)
  const h = { headers: oturum.basliklar }

  // 03 · PANEL — app/(dashboard)/teacher/layout.tsx:52 ve panel kartları.
  await istek(
    toplayici,
    '03_panel',
    `${ayar.url}/rest/v1/teacher_student_overview_view?select=*&limit=50`,
    h
  )

  // 04 · ÖĞRENCİ DETAYI — en ağır sayfa; 092'nin ölçtüğü yol.
  await istek(
    toplayici,
    '04_ogrenci_detay',
    `${ayar.url}/rest/v1/students?select=*&id=eq.${ogrenci.id}`,
    h
  )
  await istek(
    toplayici,
    '05_ogrenci_operasyon',
    `${ayar.url}/rest/v1/teacher_student_operation_view?select=*&student_id=eq.${ogrenci.id}`,
    h
  )

  // 06 · HAFTAM — haftalık akış.
  await istek(
    toplayici,
    '06_haftam',
    `${ayar.url}/rest/v1/weekly_flows?select=*&student_id=eq.${ogrenci.id}&limit=20`,
    h
  )

  // 07 · ÖDEV — özet view + kalemler.
  await istek(
    toplayici,
    '07_odev_ozet',
    `${ayar.url}/rest/v1/student_weekly_homework_summary_view?select=*&student_id=eq.${ogrenci.id}`,
    h
  )
  await istek(
    toplayici,
    '08_odev_kalemleri',
    `${ayar.url}/rest/v1/homework_items?select=*&limit=50`,
    h
  )

  // 09 · FİNANS — kiracının en hassas ticari verisi; RLS'i en çok
  // katmanlı olan yol.
  await istek(
    toplayici,
    '09_finans',
    `${ayar.url}/rest/v1/student_month_finance_view?select=*&student_id=eq.${ogrenci.id}`,
    h
  )

  // 10 · KİTAP İLERLEYİŞİ — birleştirme ağırlıklı view.
  await istek(
    toplayici,
    '10_kitap_ilerleyis',
    `${ayar.url}/rest/v1/student_book_progress_view?select=*&student_id=eq.${ogrenci.id}`,
    h
  )

  // 11 · YAZMA — gün notu upsert'i.
  //
  // Neden bu yazma: küçük, kendi kiracısına ait, tekrarlanabilir ve
  // `WITH CHECK` tarafını gerçekten çalıştırıyor. `Prefer: resolution`
  // ile aynı gün tekrar koşulduğunda satır çoğalmaz.
  if (ayar.yazmaAcik) {
    await istek(toplayici, '11_yazma_gun_notu', `${ayar.url}/rest/v1/student_day_notes`, {
      method: 'POST',
      headers: {
        ...oturum.basliklar,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        student_id: ogrenci.id,
        workspace_id: oturum.workspaceId,
        note_date: buGun(),
        note: 'LOAD-01 prob notu',
      }),
    })
  }

  // 12 · SAĞLIK UCU — Vercel tarafını da ölç.
  //
  // Uygulama URL'si verilmediyse atlanır: Supabase'i ölçen bir koşumcu
  // Vercel Active CPU hakkında hiçbir şey söylemez ve bunu gizlememek
  // gerekir.
  if (ayar.appUrl) {
    await istek(toplayici, '12_saglik', `${ayar.appUrl}/api/health`, {})
  }
}
