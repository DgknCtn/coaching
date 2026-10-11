import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  canRunLive,
  SKIP_REASON,
  COACH_EMAIL,
  COACH_PASSWORD,
  testStudentId,
  login,
  issueStudentPin,
  issueParentPin,
} from './helpers/live'

// ROL YÜRÜYÜŞLERİ — TELEFON GENİŞLİĞİNDE (375 px) (canlıya alma Faz 2.2,
// PRD B09/B10).
//
// Koç, öğrenci ve veli kendi sayfalarını gezer. Her sayfada:
//   * rota korunuyor mu (oturum düşüp /login'e mi yönlendi),
//   * yatay taşma var mı (telefonda yana kayan sayfa),
//   * WCAG 2.1 AA ihlali var mı (axe).
// Bulgular tek seferde raporlanır (expect.soft): ilk hatada durmak,
// düzeltilecek listenin yalnız ilk maddesini gösterirdi.
//
// YALNIZ A test hesabı ve "Test…" öğrencisi (helpers/live.ts). Veli bir
// kez "Test Veli" olarak açılır, sonraki koşumlarda PIN'i yenilenir.
// Ekran görüntüleri: test-results/mobil/<rol>-<sayfa>.png

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })
test.describe.configure({ mode: 'serial' })
test.skip(!canRunLive, SKIP_REASON)

let studentId = ''
let student = { username: '', pin: '' }
let parent = { username: '', pin: '' }

async function audit(page: Page, role: string, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  const name = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'ana'
  await page.screenshot({ path: `test-results/mobil/${role}-${name}.png`, fullPage: true })

  expect.soft(new URL(page.url()).pathname, `${path}: rota korunmadı`).toBe(path.split('?')[0])

  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    view: window.innerWidth,
  }))
  expect.soft(overflow.scroll, `${path}: yatay taşma (${overflow.scroll}px > ${overflow.view}px)`).toBeLessThanOrEqual(
    overflow.view + 1
  )

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze()
  const summary = results.violations
    .map((v) => `\n  [${v.impact ?? '?'}] ${v.id}: ${v.help}\n${v.nodes.slice(0, 3).map((n) => `    ${n.target.join(' ')}`).join('\n')}`)
    .join('')
  expect.soft(results.violations, `${path} erişilebilirlik ihlalleri:${summary}`).toEqual([])
}

test('koç sayfaları telefonda', async ({ page }) => {
  test.setTimeout(240_000)
  studentId = await testStudentId()
  await login(page, COACH_EMAIL, COACH_PASSWORD)

  // Öğrenci ve veli girişleri koçun ekranından verilir.
  student = await issueStudentPin(page, studentId)
  parent = await issueParentPin(page, studentId)

  for (const path of [
    '/teacher',
    '/teacher/students',
    `/teacher/students/${studentId}`,
    `/teacher/students/${studentId}?sekme=veliler`,
    `/teacher/students/${studentId}/haftalik-akis`,
    `/teacher/students/${studentId}/report`,
    '/teacher/tasks',
    '/teacher/gorusmeler',
    '/teacher/finans',
    '/teacher/books',
    '/teacher/terms',
    '/teacher/ayarlar',
  ]) {
    await audit(page, 'koc', path)
  }
})

test('öğrenci sayfaları telefonda', async ({ browser }) => {
  test.setTimeout(180_000)
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true })).newPage()
  await login(page, student.username, student.pin)
  await expect(page).toHaveURL(/\/student/)
  for (const path of ['/student', '/student/haftam', '/student/books', '/student/curriculum', '/student/review']) {
    await audit(page, 'ogrenci', path)
  }
})

test('veli sayfaları telefonda', async ({ browser }) => {
  test.setTimeout(120_000)
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true })).newPage()
  await login(page, parent.username, parent.pin)
  await expect(page).toHaveURL(/\/parent/)
  await audit(page, 'veli', '/parent')
  await audit(page, 'veli', `/parent/students/${studentId}`)
})
