// LOAD-01 · KADEMELİ YÜK TESTİ KOŞUMCUSU
//
// ============================================================
// DURUM: HAZIR, ÜRETİMDE KOŞULMAZ
//
// Denetimin §9'u kademeli bir yük testi istiyor ve P0'lar kapandıktan
// SONRA koşulmasını şart koşuyor. P0'lar kapandı. Test hâlâ
// koşulmuyor çünkü elde ayrı bir staging projesi yok: yükü üretim
// veritabanına bindirmek hem ölçümü kirletir hem gerçek kiracıyı
// etkiler (`operations.md` §5).
//
// Bu dosya o kararın kalıcı hâli: koşumcu hazır, kilidi üretimi
// koruyor, staging geldiği gün tek komutla koşuyor.
//
// ============================================================
// KULLANIM
//
//   ALLOW_LOAD_TEST=1 \
//   LOAD_SUPABASE_URL=https://<staging-ref>.supabase.co \
//   LOAD_SUPABASE_ANON_KEY=... \
//   LOAD_USERS='ogretmen1@x.com:sifre,ogretmen2@x.com:sifre' \
//   LOAD_STAGE=taban \
//   npm run load
//
// Seçimlik: LOAD_APP_URL (Vercel tarafını da ölçmek için),
// LOAD_WRITES=0 (yazmaları kapat).
//
// ============================================================
// ÜRETİM KİLİDİ — TEK GERÇEK KORUMA
//
// Yanlışlıkla üretime yük bindirmenin önünde tek bir şey duruyor: bu
// kilit. İki koşul birlikte aranıyor ve İKİSİ DE zorunlu:
//
//   1. ALLOW_LOAD_TEST=1 — açık niyet beyanı.
//   2. Hedef, .env.local'deki üretim URL'siyle AYNI OLMAMALI.
//
// İkincisi olmadan birincisi yetmez: bayrağı bir kez açan geliştirici,
// hedefi değiştirmeyi unutursa üretime 250 eşzamanlı istek gönderir.
// `tests/helpers/tenant.ts` aynı iki katmanı (kimlik + açık izin)
// kullanıyor; oradaki gerekçe burada daha da geçerli, çünkü bu dosya
// yalnız okumuyor, yazıyor.
// ============================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { girisYap, tur } from './senaryolar.mjs'
import { raporYaz, toplayiciOlustur } from './olcum.mjs'

/** `operations.md` §5'teki kademe tablosunun birebir karşılığı. */
const KADEMELER = {
  taban: { esZamanli: 10, dakika: 10, amac: 'Betikleri ve kimlik doğrulamayı doğrula' },
  normal: { esZamanli: 40, dakika: 15, amac: 'Tipik etkileşim karışımı' },
  buyume: { esZamanli: 100, dakika: 20, amac: 'DB/API/CPU eğilimi' },
  stres: { esZamanli: 250, dakika: 15, amac: 'İlk doyma noktası' },
  asiri: { esZamanli: 500, dakika: 10, amac: 'Yalnız öncekiler sağlıklıysa' },
}

function cik(mesaj) {
  console.error(`\nLOAD-01 KOŞMADI: ${mesaj}\n`)
  process.exit(1)
}

/** .env.local'deki ÜRETİM URL'si — kilidin karşılaştırma noktası. */
function uretimUrl() {
  try {
    const metin = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    const satir = metin
      .split(/\r?\n/)
      .find(s => s.trimStart().startsWith('NEXT_PUBLIC_SUPABASE_URL='))
    return satir ? satir.split('=').slice(1).join('=').trim().replace(/\/+$/, '') : null
  } catch {
    // Dosya yoksa kilit ZAYIFLAMAZ: karşılaştırma yapılamadığında
    // koşum reddedilir (aşağıda).
    return null
  }
}

function ayarOku() {
  const url = (process.env.LOAD_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
  const anonKey = (process.env.LOAD_SUPABASE_ANON_KEY ?? '').trim()
  const appUrl = (process.env.LOAD_APP_URL ?? '').trim().replace(/\/+$/, '')
  const kademeAdi = (process.env.LOAD_STAGE ?? 'taban').trim()

  if (process.env.ALLOW_LOAD_TEST !== '1') {
    cik(
      'ALLOW_LOAD_TEST=1 yok. Yük testi kazara başlatılabilecek bir şey ' +
        'olmamalı; açık niyet beyanı gerekiyor.'
    )
  }

  if (!url || !anonKey) {
    cik('LOAD_SUPABASE_URL ve LOAD_SUPABASE_ANON_KEY zorunlu.')
  }

  const uretim = uretimUrl()
  if (!uretim) {
    cik(
      '.env.local okunamadı, yani hedefin ÜRETİM olup olmadığı ' +
        'doğrulanamıyor. Doğrulanamayan hedefe yük bindirilmez.'
    )
  }
  if (url === uretim) {
    // ÜÇÜNCÜ KATMAN: AÇIK VE AYRI ONAY.
    //
    // Kilit kaldırılmadı, çünkü bu projenin "test sitesi" olması bir
    // KARAR, kodun bildiği bir gerçek değil. Kilidi silmek, bir dahaki
    // sefere kimsenin düşünmemesi demek olurdu; ayrı bir bayrak
    // istemek, her koşuda yeniden düşünmeyi zorunlu kılıyor.
    //
    // Bayrağın adı uzun ve rahatsız edici — bilinçli. `LOAD_FORCE=1`
    // gibi bir ad, kopyalanıp unutulmaya davetiye olurdu.
    if (process.env.LOAD_ALLOW_PRODUCTION_TARGET !== '1') {
      cik(
        `hedef ÜRETİM projesi (${url}). Yük testi normalde ayrı bir ` +
          'staging projesine koşulur: üretime yapay yük bindirmek hem ' +
          'ölçümü kirletir hem gerçek kiracıyı etkiler (operations.md §5).\n' +
          '\nBu proje bilerek hedefleniyorsa LOAD_ALLOW_PRODUCTION_TARGET=1 ' +
          'eklenmeli. Eklemeden önce iki soru:\n' +
          '  1. Bu veritabanının GÜNCEL bir yedeği var mı?\n' +
          '  2. Yazma açıksa (LOAD_WRITES=0 değilse) canlıya prob kaydı ' +
          'düşeceğini ve sonra silinmesi gerektiğini biliyor musun?'
      )
    }

    console.log(
      '\nDİKKAT: hedef ÜRETİM projesi ve LOAD_ALLOW_PRODUCTION_TARGET=1 ile ' +
        'açıkça onaylandı.\n' +
        'Kabul edilen: gerçek veriye yük biniyor, ölçüm gerçek kullanımla ' +
        'karışıyor' +
        (process.env.LOAD_WRITES === '0'
          ? ' (yazma KAPALI).'
          : ', ve canlıya prob kaydı yazılacak — koşumdan sonra silinmeli.') +
        '\n'
    )
  }
  if (appUrl && uretim && appUrl.includes(new URL(uretim).hostname.split('.')[0])) {
    cik(`LOAD_APP_URL üretim projesine işaret ediyor (${appUrl}).`)
  }

  const kademe = KADEMELER[kademeAdi]
  if (!kademe) {
    cik(`bilinmeyen kademe "${kademeAdi}". Seçenekler: ${Object.keys(KADEMELER).join(', ')}`)
  }

  // SÜRE AŞMASI — YALNIZ DUMAN TESTİ İÇİN.
  //
  // Senaryodaki bir yol adı yanlışsa (view yeniden adlandırılmış, filtre
  // kolonu değişmiş) bunu 10 dakika bekleyip öğrenmek gereksiz. 1
  // dakikalık bir koşu betiği doğrular; gerçek ölçüm kademenin kendi
  // süresiyle yapılır.
  //
  // Rapora süre yazıldığı için kısa koşu gizlenemez: çıktıda hangi süre
  // kullanıldığı görünür.
  const dakikaAsma = Number.parseFloat(process.env.LOAD_DAKIKA ?? '')
  const sureliKademe = Number.isFinite(dakikaAsma) && dakikaAsma > 0
    ? { ...kademe, dakika: dakikaAsma, amac: `${kademe.amac} (süre aşıldı: ${dakikaAsma} dk)` }
    : kademe

  const kullanicilar = (process.env.LOAD_USERS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(parca => {
      const ayirici = parca.lastIndexOf(':')
      return { email: parca.slice(0, ayirici), password: parca.slice(ayirici + 1) }
    })
    .filter(k => k.email && k.password)

  if (kullanicilar.length === 0) {
    cik(
      'LOAD_USERS boş. Anon uçlara vurmak yanıltır — denetim: "Do not ' +
        'use a single synthetic endpoint as a proxy." Gerçek rollerle ' +
        'giriş yapılmadan ölçülen şey ürün değildir.'
    )
  }

  return {
    url,
    anonKey,
    appUrl: appUrl || null,
    kademeAdi,
    kademe: sureliKademe,
    kullanicilar,
    yazmaAcik: process.env.LOAD_WRITES !== '0',
  }
}

/** Tek bir sanal kullanıcı: süre bitene kadar tur döndürür. */
async function sanalKullanici(ayar, oturum, toplayici, bitisZamani) {
  while (Date.now() < bitisZamani) {
    await tur(ayar, oturum, toplayici)

    // DÜŞÜNME SÜRESİ. Gerçek kullanıcı turları arka arkaya yapmaz;
    // sıfır beklemeyle koşmak, ölçüyü "sistem ne kadar hızlı boğulur"a
    // çevirir ve gecikme sayılarını anlamsızlaştırır.
    await new Promise(c => setTimeout(c, 500 + Math.random() * 1500))
  }
}

async function main() {
  const ayar = ayarOku()
  const { kademe, kademeAdi } = ayar

  console.log(
    `LOAD-01 · kademe="${kademeAdi}" eşzamanlı=${kademe.esZamanli} ` +
      `süre=${kademe.dakika}dk yazma=${ayar.yazmaAcik ? 'açık' : 'kapalı'}`
  )
  console.log(`amaç: ${kademe.amac}`)
  console.log(`hedef: ${ayar.url}${ayar.appUrl ? ` + ${ayar.appUrl}` : ' (Vercel ölçülmüyor)'}`)

  const toplayici = toplayiciOlustur()

  // GİRİŞ HESAP BAŞINA BİR KEZ — SANAL KULLANICI BAŞINA DEĞİL.
  //
  // İlk tasarımda her sanal kullanıcı kendi girişini yapıyordu. 40
  // eşzamanlıda bu, ~90 saniye içinde 40 giriş isteği demek ve
  // Supabase Auth'un kendi hız sınırına (varsayılan: /token ucu için
  // 5 dakikada 30 istek) çarpar. Sonuç ölçüm değil, 429 yığını olurdu:
  // yani ürünün kapasitesini değil, kimlik doğrulama kotasını ölçerdik.
  //
  // Gerçek kullanıcı da her tıklamada yeniden giriş yapmaz; oturum
  // token'ı ile gezer. Token paylaşmak bu davranışı daha iyi taklit
  // ediyor ve ölçüyü veri yoluna odaklıyor.
  console.log(`\n${ayar.kullanicilar.length} hesapla giriş yapılıyor...`)
  const oturumlar = []
  for (const kullanici of ayar.kullanicilar) {
    oturumlar.push(await girisYap(ayar, kullanici, toplayici))
  }
  console.log(
    oturumlar
      .map(o => `  ${o.etiket}: ${o.ogrenciler.length} öğrenci görünüyor`)
      .join('\n')
  )

  const bitis = Date.now() + kademe.dakika * 60_000

  // RAMPA: hepsini aynı anda başlatmak yapay bir "cold start" zirvesi
  // üretir ve p99'u o zirve belirler. Eşzamanlılık kademe süresinin ilk
  // %10'unda doğrusal açılıyor.
  const rampaMs = (kademe.dakika * 60_000) / 10
  const gecikme = rampaMs / Math.max(kademe.esZamanli, 1)

  const isler = []
  for (let i = 0; i < kademe.esZamanli; i++) {
    const oturum = oturumlar[i % oturumlar.length]
    isler.push(
      new Promise(c => setTimeout(c, i * gecikme)).then(() =>
        sanalKullanici(ayar, oturum, toplayici, bitis)
      )
    )
  }

  const sonuclar = await Promise.allSettled(isler)
  const patlayan = sonuclar.filter(s => s.status === 'rejected')

  raporYaz(`LOAD-01 · ${kademeAdi}`, toplayici.rapor())

  if (patlayan.length > 0) {
    console.log(`\n${patlayan.length} sanal kullanıcı hata ile bitti. İlk hata:`)
    console.log(String(patlayan[0].reason))
  }

  console.log(
    '\nKABUL KAPISI: bu koşumdan sonra yetki gerilemesi olmadığı ' +
      'AYRICA doğrulanmalı:\n' +
      '  ALLOW_LIVE_RLS_TESTS=1 npx vitest run tests/tenant-isolation.test.ts tests/cross-tenant.test.ts\n' +
      'Gecikme hedefleri tutsa bile 42501 > 0 ise kademe GEÇMEMİŞ sayılır.'
  )

  // 42501 gördüysek çıkış kodu hata: CI'da sessizce yeşil kalmasın.
  const t = toplayici.rapor().toplam
  if ((t.yetki_42501 ?? 0) > 0) process.exit(2)
}

main().catch(hata => {
  console.error(hata)
  process.exit(1)
})
