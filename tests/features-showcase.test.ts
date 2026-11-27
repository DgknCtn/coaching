import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CATEGORIES,
  FEATURES,
  featuredFeatures,
  featuresOf,
  publicCategories,
  publicFeatures,
} from '@/lib/features/catalog'
import { MOCK_LABEL } from '@/components/marketing/features/mock-meta'
import { FAQS, HOME_FAQS } from '@/components/marketing/faq-section'
import { MARKETING_EVENTS, marketingEventSchema, deviceFromWidth } from '@/lib/marketing/events'
import { PUBLIC_ROUTES } from '@/lib/brand'
import { normalizeSignupSource } from '@/lib/signup-source'

// FEATURE SHOWCASE PRD — kabul kriterleri (§17) ve riskler (§16).

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('özellik kataloğu', () => {
  it('id ve slug’lar tekil; kategori anchor’ları özellik anchor’larıyla çakışmaz', () => {
    const ids = FEATURES.map(f => f.id)
    const slugs = [...FEATURES.map(f => f.slug), ...CATEGORIES.map(c => c.slug)]
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/)
  })

  it('her özelliğin kategorisi var; PRD’nin 8 kategorisinin hepsi herkese açık', () => {
    const cats = new Set(CATEGORIES.map(c => c.id))
    for (const f of FEATURES) expect(cats.has(f.category), f.id).toBe(true)
    expect(publicCategories()).toHaveLength(8)
    for (const c of publicCategories()) expect(featuresOf(c.id).length, c.slug).toBeGreaterThan(0)
  })

  it('planlanan özellikler herkese açık listede YOK (PRD Risk 2)', () => {
    const shown = new Set(publicFeatures().map(f => f.id))
    for (const f of FEATURES.filter(x => x.status === 'planned' || x.status === 'archived')) {
      expect(shown.has(f.id), f.id).toBe(false)
    }
    expect(featuredFeatures().every(f => f.status === 'available')).toBe(true)
  })

  it('anasayfa önizlemesi 5–7 kart (PRD §8.3)', () => {
    expect(featuredFeatures().length).toBeGreaterThanOrEqual(5)
    expect(featuredFeatures().length).toBeLessThanOrEqual(7)
  })

  it('herkese açık her özelliğin içeriği dolu; her kategori ekranının etiketi var', () => {
    for (const f of publicFeatures()) {
      expect(f.benefit.length, f.id).toBeGreaterThan(10)
      expect(f.bullets.length, f.id).toBeGreaterThan(0)
    }
    for (const c of CATEGORIES) {
      expect(c.mocks.length, c.slug).toBeGreaterThan(0)
      for (const m of c.mocks) expect(MOCK_LABEL[m], m).toBeTruthy()
    }
  })

  it('ürünün desteklemediği ekip özelliği tanıtılmıyor', () => {
    const text = JSON.stringify(publicFeatures()).toLocaleLowerCase('tr')
    expect(text).not.toMatch(/ekip üyesi|öğretmen davet|çoklu öğretmen/)
  })
})

describe('/ozellikler sayfası', () => {
  const page = read('app/ozellikler/page.tsx')

  it('fiyat anasayfadaki AYNI bileşenden; sayfada kopya fiyat yok (PRD §7.3/16)', () => {
    expect(page).toMatch(/<PricingSection \/>/)
    expect(page).not.toMatch(/formatKurus|quote\(|₺|\bTL\b/)
  })

  it('herkese açık yol, site haritasında ve kendi metadata’sı var', () => {
    expect(read('middleware.ts')).toMatch(/pathname === '\/ozellikler'/)
    expect(PUBLIC_ROUTES.some(r => r.path === '/ozellikler')).toBe(true)
    expect(page).toMatch(/İZ Özellikleri \| Öğrenci, Ödev ve Kitap Takibi/)
    expect(page).toMatch(/canonical: '\/ozellikler'/)
  })

  it('navbar ve footer /ozellikler’e bağlanır', () => {
    expect(read('components/marketing/navbar.tsx').match(/href="\/ozellikler"/g)?.length).toBe(2)
    const footer = read('components/marketing/footer.tsx')
    for (const a of ['/ozellikler"', '/ozellikler#ogretmen', '/ozellikler#ogrenci', '/ozellikler#veli']) {
      expect(footer.includes(a), a).toBe(true)
    }
  })

  it('kayıt kaynakları tanınıyor', () => {
    expect(normalizeSignupSource('ozellikler')).toBe('ozellikler')
    expect(normalizeSignupSource('onizleme')).toBe('onizleme')
  })
})

describe('SSS', () => {
  it('PRD soruları yalnız /ozellikler’de; anasayfa ve FAQPage değişmedi', () => {
    expect(FAQS.some(f => f.featuresOnly)).toBe(true)
    expect(HOME_FAQS.some(f => f.featuresOnly)).toBe(false)
    expect(read('components/marketing/structured-data.tsx')).toMatch(/HOME_FAQS\.map/)
  })

  it('sayısal taahhütler sabitlerden geliyor (elle yazılmış süre/sınır yok)', () => {
    const src = read('components/marketing/faq-section.tsx')
    expect(src).toMatch(/\$\{TRIAL_DAYS\}/)
    expect(src).toMatch(/\$\{TRIAL_STUDENT_LIMIT\}/)
    expect(src).toMatch(/\$\{MAX_MONTHS\}/)
    expect(src).toMatch(/\$\{MAX_SELF_SERVICE_STUDENTS\}/)
  })
})

describe('pazarlama olayları (PRD §14)', () => {
  it('geçerli olay kabul, bilinmeyen olay ve fazladan alan (kişisel veri) reddedilir', () => {
    expect(marketingEventSchema.safeParse({ event: 'features_page_view', page: 'features', device: 'mobile' }).success).toBe(true)
    expect(marketingEventSchema.safeParse({ event: 'baska_olay' }).success).toBe(false)
    expect(marketingEventSchema.safeParse({ event: 'feature_cta_click', email: 'a@b.com' }).success).toBe(false)
    expect(marketingEventSchema.safeParse({ event: 'feature_cta_click', cta: 'Ali Veli' }).success).toBe(false)
  })

  it('cihaz kırılımları PRD §9.1 ile aynı', () => {
    expect(deviceFromWidth(320)).toBe('mobile')
    expect(deviceFromWidth(768)).toBe('tablet')
    expect(deviceFromWidth(1024)).toBe('desktop')
  })

  it('migration 158: CHECK listesi = uygulama listesi; RLS açık, politika ve anon yetkisi yok', () => {
    const sql = read('supabase/migrations/158_marketing_events.sql')
    const block = sql.slice(sql.indexOf('event       TEXT NOT NULL CHECK'), sql.indexOf(')),', sql.indexOf('event       TEXT NOT NULL CHECK')))
    const inSql = [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort()
    expect(inSql).toEqual([...MARKETING_EVENTS].sort())
    expect(sql).toMatch(/ALTER TABLE public\.marketing_events ENABLE ROW LEVEL SECURITY/)
    expect(sql).not.toMatch(/CREATE POLICY/)
    expect(sql).not.toMatch(/GRANT[^;]*TO\s+anon/i)
    expect(sql).toMatch(/is_platform_admin\(\)/)
  })

  it('olay tablosuna kişisel veri sütunu yok', () => {
    const sql = read('supabase/migrations/158_marketing_events.sql').toLowerCase()
    for (const col of ['ip ', 'user_id', 'profile_id', 'email', 'cookie']) expect(sql.includes(col), col).toBe(false)
  })
})
