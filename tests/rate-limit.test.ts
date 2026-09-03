import { describe, expect, it } from 'vitest'
import { RATE_LIMITS, rateLimitMessage } from '@/lib/rate-limit'

// Hız sınırı yapılandırması ve kullanıcı mesajı (050).
//
// Sayma işi veritabanında (check_rate_limit RPC) ve orada atomik; burada
// test edilen, sınırların makul kalması ve mesajın doğru üretilmesi.
// Sınırlar sessizce gevşetilirse bu dosya kırılır — asıl amaç bu.

describe('RATE_LIMITS · sınır tanımları', () => {
  it('dört kimlik akışının hepsi kapsanır', () => {
    expect(Object.keys(RATE_LIMITS).sort()).toEqual([
      'inviteAccept',
      'login',
      'passwordReset',
      'register',
    ])
  })

  it('hiçbir sınır sessizce gevşetilmedi', () => {
    for (const [action, limit] of Object.entries(RATE_LIMITS)) {
      expect(limit.max, `${action} deneme sayısı`).toBeGreaterThan(0)
      expect(limit.max, `${action} sınırı fazla gevşek`).toBeLessThanOrEqual(10)
      expect(limit.windowSeconds, `${action} penceresi`).toBeGreaterThanOrEqual(15 * 60)
    }
  })

  it('kayıt ve şifre sıfırlama girişten daha dar', () => {
    // Kayıt her seferinde bir workspace açıyor, şifre sıfırlama e-posta
    // gönderiyor: ikisi de girişten pahalı işler.
    expect(RATE_LIMITS.register.max).toBeLessThan(RATE_LIMITS.login.max)
    expect(RATE_LIMITS.passwordReset.max).toBeLessThan(RATE_LIMITS.login.max)
  })
})

describe('rateLimitMessage', () => {
  it('bir dakikanın altında tekil ifade kullanır', () => {
    expect(rateLimitMessage(0)).toContain('bir dakika')
    expect(rateLimitMessage(45)).toContain('bir dakika')
    expect(rateLimitMessage(60)).toContain('bir dakika')
  })

  it('kalan süreyi yukarı yuvarlar', () => {
    // 61 saniye "1 dakika" değil "2 dakika" olmalı: erken dönen kullanıcı
    // tekrar reddedilmemeli.
    expect(rateLimitMessage(61)).toContain('2 dakika')
    expect(rateLimitMessage(15 * 60)).toContain('15 dakika')
  })

  it('süreyi asla eksi göstermez', () => {
    expect(rateLimitMessage(-30)).toContain('bir dakika')
  })
})
