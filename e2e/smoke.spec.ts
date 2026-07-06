import { test, expect } from '@playwright/test'

// Herkese açık, kimlik doğrulama gerektirmeyen rotalar için smoke testleri.
// Amaç: uygulama boot oluyor, middleware public rotaları engellemiyor,
// health endpoint 200 dönüyor.

test('health endpoint returns ok', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('ok')
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
