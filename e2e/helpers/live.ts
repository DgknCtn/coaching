import { expect, type Page } from '@playwright/test'

// CANLI E2E YARDIMCILARI — gerçek Supabase, YALNIZ A test hesabı ve onun
// "Test…" öğrencisi. Diğer test hesabı gerçek öğrencilerin olduğu canlı
// alan; bu yardımcılar ona hiç girmez.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
export const COACH_EMAIL = process.env.TEST_TENANT_A_EMAIL ?? ''
export const COACH_PASSWORD = process.env.TEST_TENANT_A_PASSWORD ?? ''

export const canRunLive =
  URL.startsWith('https://') &&
  !URL.includes('placeholder') &&
  process.env.ALLOW_LIVE_RLS_TESTS === '1' &&
  !!COACH_EMAIL &&
  !!COACH_PASSWORD &&
  !!process.env.STUDENT_LOGIN_SECRET &&
  !!process.env.STUDENT_LOGIN_EMAIL_DOMAIN

export const SKIP_REASON =
  'Canlı kimlik bilgileri yok (ALLOW_LIVE_RLS_TESTS, TEST_TENANT_A_*, STUDENT_LOGIN_*).'

/** A hesabının "Test…" öğrencisi; gerçek öğrenciye asla düşmez. */
export async function testStudentId(): Promise<string> {
  const auth = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: COACH_EMAIL, password: COACH_PASSWORD }),
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

export async function login(page: Page, identifier: string, secret: string) {
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

async function openLoginsTab(page: Page, studentId: string) {
  await page.goto(`/teacher/students/${studentId}?sekme=veliler`)
  // Hidrasyon bitmeden tıklanan kutu React durumuna yansımıyor; sunucu da
  // onay yok diye reddediyor. Ağ sakinleşince etkileşime geçilir.
  await page.waitForLoadState('networkidle')
  const consent = page.getByRole('checkbox', { name: /Veli onayı/ })
  if (await consent.isVisible()) {
    await consent.check()
    await expect(consent).toBeChecked()
  }
}

/** Gösterilen kullanıcı adı + PIN'i oku; sunucu hatası toast'ını yüzeye çıkar. */
async function readIssued(page: Page) {
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

/** Test öğrencisine kullanıcı adı + PIN ver (ya da yenile). */
export async function issueStudentPin(page: Page, studentId: string) {
  await openLoginsTab(page, studentId)
  await page
    .getByTestId('login-card-student')
    .getByRole('button', { name: /Kullanıcı adı \+ PIN ver|Yeni PIN üret/ })
    .click()
  return readIssued(page)
}

/**
 * Test öğrencisinin velisine PIN ver: veli kartı varsa yenile, yoksa bir
 * kez "Test Veli" oluştur (yeniden koşumda yeni veli hesabı açılmaz).
 */
export async function issueParentPin(page: Page, studentId: string) {
  await openLoginsTab(page, studentId)
  const card = page.getByTestId('login-card-parent').first()
  if (await card.isVisible()) {
    await card.getByRole('button', { name: /Kullanıcı adı \+ PIN ver|Yeni PIN üret/ }).click()
  } else {
    await page.getByRole('button', { name: /Veli için kullanıcı adı \+ PIN oluştur/ }).click()
    await page.getByLabel('Velinin adı soyadı').fill('Test Veli')
    await page.getByRole('button', { name: 'Oluştur' }).click()
  }
  return readIssued(page)
}
