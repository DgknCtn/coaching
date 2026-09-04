import { describe, it, expect } from 'vitest'
import { normalizeReferralCode } from '@/lib/referral-code'

// PARTNER ATIF KODU DOĞRULAMASI.
//
// Çereze gelen değer TAMAMEN KULLANICI KONTROLÜNDE. Biçimsiz bir değeri
// veritabanına kadar taşımanın anlamı yok; kural burada, veritabanındaki
// CHECK ile aynı şekilde uygulanıyor (059: '^[A-Z0-9]{4,20}$').

describe('normalizeReferralCode', () => {
  it('geçerli kodu büyük harfe çevirir', () => {
    expect(normalizeReferralCode('abc123')).toBe('ABC123')
    expect(normalizeReferralCode('PARTNER1')).toBe('PARTNER1')
  })

  it('baştaki ve sondaki boşluğu atar', () => {
    // Bağlantı kopyalanırken boşluk yapışması çok yaygın.
    expect(normalizeReferralCode('  ABC123  ')).toBe('ABC123')
  })

  it('uzunluk sınırlarını uygular', () => {
    expect(normalizeReferralCode('ABC')).toBeNull()
    expect(normalizeReferralCode('ABCD')).toBe('ABCD')
    expect(normalizeReferralCode('A'.repeat(20))).toBe('A'.repeat(20))
    expect(normalizeReferralCode('A'.repeat(21))).toBeNull()
  })

  it('harf ve rakam dışını reddeder', () => {
    // SQL enjeksiyonu ya da yol manipülasyonu denemesi buraya kadar
    // bile gelmemeli.
    expect(normalizeReferralCode("ABC'; DROP TABLE partners;--")).toBeNull()
    expect(normalizeReferralCode('ABC-123')).toBeNull()
    expect(normalizeReferralCode('ABC 123')).toBeNull()
    expect(normalizeReferralCode('../../etc')).toBeNull()
    expect(normalizeReferralCode('<script>')).toBeNull()
  })

  it('boş değerlerde null döner', () => {
    expect(normalizeReferralCode(null)).toBeNull()
    expect(normalizeReferralCode(undefined)).toBeNull()
    expect(normalizeReferralCode('')).toBeNull()
    expect(normalizeReferralCode('   ')).toBeNull()
  })

  it('veritabanı kuralıyla aynı biçimi kabul eder', () => {
    // 059'daki CHECK: code ~ '^[A-Z0-9]{4,20}$'
    const dbRule = /^[A-Z0-9]{4,20}$/
    for (const raw of ['abcd', 'ABC123', 'x1y2z3', 'A'.repeat(20)]) {
      const normalized = normalizeReferralCode(raw)
      expect(normalized).not.toBeNull()
      expect(dbRule.test(normalized!)).toBe(true)
    }
  })
})
