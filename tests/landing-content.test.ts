import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { demoBook, demoLedger, ledgerBalance, DEMO_LESSONS, MAX_DEMO_TESTS } from '@/components/marketing/demo/tour-fixtures'
import { COMPARISON } from '@/components/marketing/comparison-section'
import { FAQS } from '@/components/marketing/faq-section'
import { normalizeSignupSource, registerHref, SIGNUP_SOURCES } from '@/lib/signup-source'

// LANDING YENİLEMESİ (27.11.2026) — vitrin ürünle çelişmesin.

describe('ürün turu örnek verisi', () => {
  it('Kitap Haritası kitabı kendi içinde tutarlı', () => {
    const book = demoBook(new Date('2026-11-27T12:00:00+03:00'))
    const all = book.sections.flatMap(s => s.tests)
    expect(book.totalTests).toBe(all.length)
    expect(book.completedTests).toBe(all.filter(t => t.state === 'completed').length)
    expect(book.maxTestsPerSection).toBe(Math.max(...book.sections.map(s => s.tests.length)))
    for (const s of book.sections) {
      expect(s.completedCount).toBe(s.tests.filter(t => t.state === 'completed').length)
    }
    expect(new Set(all.map(t => t.id)).size).toBe(all.length)
    // Mockup penceresine sığsın: fazlası kesilip durum rengi görünmez oluyordu.
    expect(book.maxTestsPerSection).toBeLessThanOrEqual(MAX_DEMO_TESTS)
  })

  it('haritada her durum rengi en az bir kez görünür', () => {
    const states = new Set(demoBook().sections.flatMap(s => s.tests.map(t => t.state)))
    for (const s of ['completed', 'pending_approval', 'overdue', 'returned', 'assigned', 'not_assigned'] as const) {
      expect(states.has(s), s).toBe(true)
    }
  })

  it('tarihler göreli: farklı günlerde farklı', () => {
    expect(demoBook(new Date('2026-01-10')).startDate).not.toBe(demoBook(new Date('2026-06-10')).startDate)
  })

  it('cari hesap bakiyesi satırların toplamı', () => {
    const rows = demoLedger()
    expect(ledgerBalance(rows)).toBe(rows.reduce((a, r) => a + r.amount, 0))
    expect(ledgerBalance(rows)).toBeGreaterThan(0)
  })

  it('ders satırlarında Calendar, Meet ve takvimde iptal örnekleri var', () => {
    expect(DEMO_LESSONS.some(l => l.fromCalendar)).toBe(true)
    expect(DEMO_LESSONS.some(l => l.meet)).toBe(true)
    expect(DEMO_LESSONS.some(l => l.state === 'calendar_cancelled')).toBe(true)
  })
})

describe('karşılaştırma tablosu', () => {
  it('İZ sütunu yalnız "var" der; diğer sütunlarda marka adı yok', () => {
    expect(COMPARISON.every(r => r.iz === 'yes')).toBe(true)
    const src = readFileSync(join(process.cwd(), 'components/marketing/comparison-section.tsx'), 'utf8')
    for (const brand of ['Google Classroom', 'Classroom', 'Edmodo', 'Moodle', 'Notion']) {
      expect(src.includes(brand), brand).toBe(false)
    }
  })
})

describe('SSS', () => {
  it('yeni özellik soruları listede (FAQPage verisi aynı listeden)', () => {
    const qs = FAQS.map(f => f.q).join(' | ')
    expect(qs).toMatch(/Google Takvim/)
    expect(qs).toMatch(/WhatsApp/)
    expect(qs).toMatch(/ödevi vermek/i)
    expect(new Set(FAQS.map(f => f.q)).size).toBe(FAQS.length)
  })
})

describe('kayıt kaynağı (ölçüm)', () => {
  it('yalnız bilinen değerler saklanır', () => {
    expect(normalizeSignupSource('hero')).toBe('hero')
    expect(normalizeSignupSource(' TUR ')).toBe('tur')
    expect(normalizeSignupSource('<script>')).toBeNull()
    expect(normalizeSignupSource(null)).toBeNull()
    expect(registerHref('fiyat')).toBe('/register?k=fiyat')
  })

  it('landing ve demo bağlantılarının hiçbiri etiketsiz /register değil', () => {
    const dirs = ['components/marketing', 'app/demo']
    const offenders: string[] = []
    for (const dir of dirs) {
      for (const f of readdirSync(join(process.cwd(), dir)).filter(n => n.endsWith('.tsx'))) {
        const src = readFileSync(join(process.cwd(), dir, f), 'utf8')
        if (/href="\/register"/.test(src)) offenders.push(`${dir}/${f}`)
      }
    }
    expect(offenders).toEqual([])
    expect(SIGNUP_SOURCES.length).toBeGreaterThan(5)
  })
})
