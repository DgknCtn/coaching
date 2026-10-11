import { test, expect, type Page } from '@playwright/test'

// TEK GİRİŞ EKRANI — UÇTAN UCA (canlıya alma, Faz 4.2).
//
// Gerçek Supabase'e karşı koşar; YALNIZ A test hesabında ve onun "Test A"
// öğrencisinde. Diğer test hesabı gerçek öğrencilerin olduğu canlı alan;
// bu spec ona hiç girmez.
//
// Akış:
//   1. Koç e-posta + şifreyle /login'den girer.
//   2. Test A'nın Veliler sekmesinde (veli onayı teyidiyle) kullanıcı adı +
//      PIN verir ya da yeniler.
//   3. Öğrenci aynı ekrandan kullanıcı adı + PIN ile girer → /student.
//   4. "PIN'imi unuttum" → koç ana sayfasında PIN talebi kartı.
//   5. Koç yeni PIN üretir → kart kapanır, eski PIN reddedilir, yeni çalışır.
//
// Yeniden koşulabilir: öğrencinin kodu varsa 2. adım "Yeni PIN üret" olur.
// Koşmak için: `npm run build && npx playwright test e2e/giris-akisi.spec.ts`

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const EMAIL = process.env.TEST_TENANT_A_EMAIL ?? ''
const PASSWORD = process.env.TEST_TENANT_A_PASSWORD ?? ''

const canRun =
  URL.startsWith('https://') &&
  !URL.includes('placeholder') &&
  process.env.ALLOW_LIVE_RLS_TESTS === '1' &&
  !!EMAIL &&
  !!PASSWORD &&
  !!process.env.STUDENT_LOGIN_SECRET &&
  !!process.env.STUDENT_LOGIN_EMAIL_DOMAIN

test.describe.configure({ mode: 'serial' })
test.skip(!canRun, 'Canlı kimlik bilgileri yok (ALLOW_LIVE_RLS_TESTS, TEST_TENANT_A_*, STUDENT_LOGIN_*).')

/** A hesabının "Test…" öğrencisi; gerçek öğrenciye asla düşmez. */
async function testStudentId(): Promise<string> {
  const auth = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const { access_token } = (await auth.json()) as { access_token: string }
  const res = await fetch(
    `${URL}/rest/v1/students?select=id,full_name&full_name=ilike.test*&order=full_name&limit=1`,
    { headers: { apikey: ANON, Authorization: `Bearer ${access_token}` } }
  )
  const rows = (await res.json()) as { id: string; full_name: string }[]
  if (!rows.length) throw new Error('A hesabında "Test" ile başlayan öğrenci yok.')
  return rows[0].id
}

async function login(page: Page, identifier: string, secret: string) {
  await page.goto('/login')
  // Hidrasyondan önce gönderilen form JS'siz POST'a düşer ve sayfa yalnız
  // yenilenir (method="post" bunu bilerek zararsız kılıyor).
  await page.waitForLoadState('networkidle')
  await page.getByLabel('E-posta veya kullanıcı adı').fill(identifier)
  await page.getByLabel('Şifre veya PIN').fill(secret)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  // Giriş ya ekrandan çıkar ya da bir hata gösterir; ikisinden birini bekle.
  await page
    .waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 })
    .catch(() => {})
  // Hız sınırı (15 dk'da 10 deneme) arka arkaya koşumlarda dolar; bu bir
  // ürün hatası değil, testi bekletmek gerekir.
  const limited = page.getByRole('alert').filter({ hasText: 'Çok fazla deneme' })
  if (await limited.isVisible()) {
    throw new Error(`Giriş hız sınırına takıldı: ${await limited.textContent()} — bekleyip yeniden koşun.`)
  }
}

/** Test öğrencisine kullanıcı adı + PIN ver (ya da yenile); bilgileri döndür. */
async function issueStudentPin(page: Page, studentId: string) {
  await page.goto(`/teacher/students/${studentId}?sekme=veliler`)
  // Hidrasyon bitmeden tıklanan kutu React durumuna yansımıyor; sunucu da
  // onay yok diye reddediyor. Ağ sakinleşince etkileşime geçilir.
  await page.waitForLoadState('networkidle')
  const consent = page.getByRole('checkbox', { name: /Veli onayı/ })
  if (await consent.isVisible()) {
    await consent.check()
    await expect(consent).toBeChecked()
  }

  // Öğrenci kartındaki düğme: ilk kez "Kullanıcı adı + PIN ver", sonra
  // "Yeni PIN üret". İlk eşleşme öğrenci bloğu (veliler altta).
  await page
    .getByRole('button', { name: /Kullanıcı adı \+ PIN ver|Yeni PIN üret/ })
    .first()
    .click()

  // Sunucu hatası toast olarak gelir; bekleme zaman aşımı yerine onu göster.
  const issued = page.getByTestId('issued-username').first()
  const toastError = page.locator('[data-sonner-toast][data-type="error"]')
  await expect(issued.or(toastError)).toBeVisible({ timeout: 30_000 })
  if (await toastError.isVisible()) throw new Error(`PIN verilemedi: ${await toastError.textContent()}`)

  const username = (await issued.textContent())?.trim()
  const pin = (await page.getByTestId('issued-pin').first().textContent())?.trim()
  expect(username, 'kullanıcı adı gösterilmedi').toBeTruthy()
  expect(pin).toMatch(/^\d{6}$/)
  return { username: username!, pin: pin! }
}

test('eski /giris adresi tek giriş ekranına yönlenir', async ({ page }) => {
  await page.goto('/giris')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: /Google/ })).toHaveCount(0)
})

test('koç PIN verir, öğrenci aynı ekrandan girer; unutulan PIN talebi ve yenileme', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const studentId = await testStudentId()

  // 1-2. Koç girer ve PIN verir.
  const coach = await (await browser.newContext()).newPage()
  await login(coach, EMAIL, PASSWORD)
  await expect(coach).toHaveURL(/\/(teacher|admin)/)
  const first = await issueStudentPin(coach, studentId)

  // 3. Öğrenci girer.
  const student = await (await browser.newContext()).newPage()
  await login(student, first.username, first.pin)
  await expect(student).toHaveURL(/\/student/)

  // 4. "PIN'imi unuttum" (oturumsuz ayrı tarayıcı).
  const forgot = await (await browser.newContext()).newPage()
  await forgot.goto('/login')
  await forgot.getByRole('button', { name: "PIN'imi unuttum" }).click()
  await forgot.getByLabel('Kullanıcı adın').fill(first.username)
  await forgot.getByRole('button', { name: 'Öğretmenime bildir' }).click()
  await expect(forgot.getByRole('status')).toContainText('İsteğin iletildi')

  await coach.goto('/teacher')
  const card = coach.getByRole('region', { name: /PIN talepleri/ })
  await expect(card).toContainText('yeni PIN istiyor')

  // 5. Yeni PIN → istek kapanır, eski PIN reddedilir, yeni çalışır.
  const second = await issueStudentPin(coach, studentId)
  expect(second.username).toBe(first.username)
  expect(second.pin).not.toBe(first.pin)

  await coach.goto('/teacher')
  await expect(coach.getByRole('region', { name: /PIN talepleri/ })).toHaveCount(0)

  const oldTry = await (await browser.newContext()).newPage()
  await login(oldTry, first.username, first.pin)
  await expect(
    oldTry.getByRole('alert').filter({ hasText: 'Kullanıcı adı ya da PIN hatalı' })
  ).toBeVisible()

  const newTry = await (await browser.newContext()).newPage()
  await login(newTry, second.username, second.pin)
  await expect(newTry).toHaveURL(/\/student/)
})
