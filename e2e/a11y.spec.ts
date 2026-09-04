import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// ERİŞİLEBİLİRLİK OTOMASYONU (Faz 5).
//
// SORUN: bugüne kadar erişilebilirlik hiçbir yerde ÖLÇÜLMÜYORDU. Kontrast
// bozan bir renk, etiketsiz bir form alanı ya da klavyeyle ulaşılamaz bir
// düğme sessizce girebilir ve kimse fark etmezdi.
//
// TİCARİ TARAF: bu yalnız bir vicdan meselesi değil. Kurumsal ve özellikle
// kamu bağlantılı müşteriler erişilebilirlik beyanı ister; ölçülmeyen bir
// şey beyan edilemez.
//
// KAPSAM — HERKESE AÇIK ROTALAR. Panel içi ekranlar oturum ister ve bu
// testler kimlik bilgisi olmadan CI'da koşuyor. Buradaki değer, kapsamın
// genişliğinden değil, REGRESYONUN DURMASINDAN geliyor: bugünkü seviye
// kilitleniyor, aşağı düşemiyor. Panel ekranları oturumlu e2e kurulunca
// aynı yardımcıyla eklenmeli.
//
// NEDEN AXE: tarayıcıda gerçek DOM üzerinde çalışır, statik analizin
// göremediği hesaplanmış kontrastı ve ARIA ağacını görür. Otomatik denetim
// ihlallerin hepsini bulmaz (klavye tuzağı, mantıklı odak sırası, ekran
// okuyucu deneyimi elle test ister) — ama bulduğu her şey gerçek ihlaldir.

// WCAG 2.1 AA. Denetimin dayanağı bu seviye; "best-practice" kuralları
// bilinçli olarak DIŞARIDA: onlar görüş bildirir, standart değildir ve
// karışınca ciddi ihlaller gürültüde kaybolur.
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const PUBLIC_ROUTES = [
  { path: '/', name: 'Tanıtım sayfası' },
  { path: '/demo', name: 'Demo' },
  { path: '/login', name: 'Giriş' },
  { path: '/register', name: 'Kayıt' },
  { path: '/gizlilik', name: 'Gizlilik metni' },
  { path: '/kosullar', name: 'Kullanım koşulları' },
  { path: '/mesafeli-satis', name: 'Mesafeli satış sözleşmesi' },
  { path: '/on-bilgilendirme', name: 'Ön bilgilendirme formu' },
  { path: '/iade', name: 'İade ve iptal koşulları' },
  // /kurulum/odeme burada YOK: oturum gerektiriyor ve bu testler kimlik
  // bilgisi olmadan koşuyor. Oturumlu e2e kurulduğunda eklenmeli —
  // kart adımı huninin en kritik ekranı.
]

for (const route of PUBLIC_ROUTES) {
  test(`${route.name} (${route.path}) WCAG 2.1 AA ihlali içermiyor`, async ({ page }) => {
    await page.goto(route.path)

    // ROTADA KALDIĞIMIZI DOĞRULA. Bu iddia olmadan test YANLIŞ GEÇİYORDU:
    // middleware oturumsuz ziyaretçiyi /login'e yönlendiriyordu ve axe
    // her seferinde aynı giriş sayfasını tarayıp "ihlal yok" diyordu.
    // Erişilebilirlik testi, ölçtüğünü sandığı sayfayı ölçtüğünden emin
    // olmalı.
    expect(new URL(page.url()).pathname).toBe(route.path)

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()

    // Hata mesajı ihlalin ADINI ve DÜĞÜMÜNÜ taşımalı: "3 ihlal bulundu"
    // diyen bir test, düzeltmek için CI kayıtlarını kazmayı gerektirir.
    const summary = results.violations
      .map(
        v =>
          `\n  [${v.impact ?? 'bilinmiyor'}] ${v.id}: ${v.help}\n` +
          v.nodes.map(n => `    ${n.target.join(' ')}`).join('\n')
      )
      .join('')

    expect(results.violations, `${route.path} erişilebilirlik ihlalleri:${summary}`).toEqual([])
  })
}

// Koyu tema ayrı bir renk kümesidir; açık temada geçen kontrast oranı
// koyuda düşebilir. İki tema iki ayrı denetim ister.
test('Tanıtım sayfası koyu temada da WCAG 2.1 AA geçiyor', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()

  const summary = results.violations
    .map(v => `\n  [${v.impact ?? 'bilinmiyor'}] ${v.id}: ${v.help}`)
    .join('')

  expect(results.violations, `Koyu tema ihlalleri:${summary}`).toEqual([])
})

// Klavye kullanıcısı için en temel iki güvence. Axe bunları göremez:
// odak halkasının GÖRÜNÜR olup olmadığı hesaplanmış stil işidir.
test('Giriş formu klavyeyle gezilebilir ve odak görünür', async ({ page }) => {
  await page.goto('/login')

  await page.keyboard.press('Tab')

  const focusVisible = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return null

    const style = getComputedStyle(el)
    return {
      tag: el.tagName,
      // Odak göstergesi ya bir outline ya da bir kutu gölgesi olmalı.
      hasOutline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
      hasShadow: style.boxShadow !== 'none',
    }
  })

  expect(focusVisible, 'Tab ile hiçbir öğeye odaklanılamadı').not.toBeNull()
  expect(
    focusVisible!.hasOutline || focusVisible!.hasShadow,
    `Odaklanan ${focusVisible!.tag} öğesinde görünür odak göstergesi yok`
  ).toBe(true)
})
