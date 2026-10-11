import { test, expect } from '@playwright/test'
import {
  canRunLive,
  SKIP_REASON,
  COACH_EMAIL as EMAIL,
  COACH_PASSWORD as PASSWORD,
  testStudentId,
  login,
  issueStudentPin,
} from './helpers/live'

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

test.describe.configure({ mode: 'serial' })
test.skip(!canRunLive, SKIP_REASON)

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
