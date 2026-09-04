import { describe, it, expect } from 'vitest'
import {
  PLAN_PRICING,
  VAT_RATE,
  kurusToPriceString,
  formatKurus,
  priceFor,
  yearlyDiscountPercent,
  yearlyPerMonthKurus,
  splitVat,
} from '@/lib/billing/pricing'

describe('kurusToPriceString', () => {
  it('iyzico biçimini üretir', () => {
    expect(kurusToPriceString(49900)).toBe('499.0')
    expect(kurusToPriceString(99900)).toBe('999.0')
    expect(kurusToPriceString(49950)).toBe('499.5')
    expect(kurusToPriceString(49999)).toBe('499.99')
    expect(kurusToPriceString(5)).toBe('0.05')
    expect(kurusToPriceString(0)).toBe('0.0')
  })

  it('kayan noktalı hata üretmez', () => {
    // 1499.90 * 12 kayan noktada 17998.800000000001 verir. Kuruş tam
    // sayısıyla hesap bunu imkânsız kılar.
    const twelve = 149990 * 12
    expect(twelve).toBe(1799880)
    expect(kurusToPriceString(twelve)).toBe('17998.8')
  })

  it('tam sayı olmayan kuruşu reddeder', () => {
    expect(() => kurusToPriceString(10.5)).toThrow()
    expect(() => kurusToPriceString(-100)).toThrow()
  })
})

describe('formatKurus', () => {
  it('Türkçe biçimde gösterir', () => {
    expect(formatKurus(49900)).toBe('499,00 ₺')
    expect(formatKurus(499000)).toBe('4.990,00 ₺')
  })
})

describe('fiyat tutarlılığı', () => {
  it('yıllık paket 12 aylıktan ucuz olmalı', () => {
    // Aksi hâlde yıllık taahhüt alıcı için cezaya dönüşür.
    for (const plan of ['starter', 'coach'] as const) {
      const p = PLAN_PRICING[plan]
      expect(p.yearlyKurus).toBeLessThan(p.monthlyKurus * 12)
    }
  })

  it('Koç planı Başlangıç planından pahalı', () => {
    expect(PLAN_PRICING.coach.monthlyKurus).toBeGreaterThan(PLAN_PRICING.starter.monthlyKurus)
    expect(PLAN_PRICING.coach.yearlyKurus).toBeGreaterThan(PLAN_PRICING.starter.yearlyKurus)
  })

  it('tüm fiyatlar tam kuruş', () => {
    for (const plan of ['starter', 'coach'] as const) {
      expect(Number.isInteger(PLAN_PRICING[plan].monthlyKurus)).toBe(true)
      expect(Number.isInteger(PLAN_PRICING[plan].yearlyKurus)).toBe(true)
    }
  })

  it('priceFor doğru dönemi seçer', () => {
    expect(priceFor('starter', 'monthly')).toBe(PLAN_PRICING.starter.monthlyKurus)
    expect(priceFor('starter', 'yearly')).toBe(PLAN_PRICING.starter.yearlyKurus)
  })
})

describe('yearlyDiscountPercent', () => {
  it('iki ay bedava ~ %16', () => {
    // 10 ay fiyatına 12 ay: (12-10)/12 = %16,66 -> aşağı yuvarlanır.
    expect(yearlyDiscountPercent('starter')).toBe(16)
  })

  it('aşağı yuvarlar, yukarı değil', () => {
    // "%17 indirim" deyip %16,7 vermek küçük ama gerçek bir yanlış beyan.
    const p = PLAN_PRICING.starter
    const real = ((p.monthlyKurus * 12 - p.yearlyKurus) / (p.monthlyKurus * 12)) * 100
    expect(yearlyDiscountPercent('starter')).toBeLessThanOrEqual(real)
  })
})

describe('yearlyPerMonthKurus', () => {
  it('aylık listeden düşük', () => {
    expect(yearlyPerMonthKurus('starter')).toBeLessThan(PLAN_PRICING.starter.monthlyKurus)
  })
})

describe('splitVat', () => {
  it('matrah ve KDV toplamı brüte eşit', () => {
    // Ayrı yuvarlayıp toplamak faturada bir kuruşluk tutarsızlık bırakır.
    for (const gross of [49900, 99900, 499000, 999000, 1, 33333, 7]) {
      const { netKurus, vatKurus } = splitVat(gross)
      expect(netKurus + vatKurus).toBe(gross)
    }
  })

  it('KDV oranı doğru uygulanır', () => {
    const { netKurus, vatKurus } = splitVat(120000)
    expect(netKurus).toBe(100000)
    expect(vatKurus).toBe(20000)
  })

  it('KDV oranı %20', () => {
    expect(VAT_RATE).toBe(0.2)
  })
})
