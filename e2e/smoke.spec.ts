import { test, expect } from '@playwright/test'

// Herkese açık, kimlik doğrulama gerektirmeyen rotalar için smoke testleri.
// Amaç: uygulama boot oluyor, middleware public rotaları engellemiyor,
// health endpoint 200 dönüyor.

// Sağlık ucu artık VERİTABANINA bakıyor (Faz 2). Bu ortamda Supabase
// kimlik bilgileri sahte olduğu için "ok" beklemek YANLIŞ bir iddia olurdu.
//
// Testin amacı değişmedi: uygulama boot oluyor mu, uç yanıt veriyor mu?
// Ama iddia sözleşmeye uydurulmalı — testi zayıflatmamak için durum ile
// HTTP kodunun tutarlılığı da doğrulanıyor: sağlıklıysa 200, değilse 503.
test('health endpoint yanıt veriyor ve durumu tutarlı', async ({ request }) => {
  const res = await request.get('/api/health')
  const body = await res.json()

  expect(['ok', 'degraded', 'down']).toContain(body.status)
  expect(typeof body.latencyMs).toBe('number')
  expect(typeof body.time).toBe('string')

  // Sözleşme: yalnız veritabanı da sağlıklıysa 200 dönülür.
  if (body.status === 'ok') {
    expect(res.status()).toBe(200)
    expect(body.database).toBe('ok')
  } else {
    expect(res.status()).toBe(503)
    expect(body.database).not.toBe('ok')
  }
})

test('landing page renders', async ({ page }) => {
  const res = await page.goto('/')
  expect(res?.status()).toBeLessThan(400)
  // Landing herkese açık; /login'e yönlenmemeli.
  expect(page.url()).not.toContain('/login')
})

test('demo page is publicly accessible', async ({ page }) => {
  await page.goto('/demo')
  expect(page.url()).toContain('/demo')
  await expect(page.locator('body')).toBeVisible()
})

test('protected route redirects anonymous user to login', async ({ page }) => {
  await page.goto('/teacher')
  await expect(page).toHaveURL(/\/login/)
})
