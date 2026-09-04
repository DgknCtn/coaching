import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  trailingZero,
  buildAuthorizationHeader,
  generateRandomKey,
  verifyResponseSignature,
  checkoutFormRetrieveSignatureFields,
  verifySubscriptionWebhookSignature,
} from '@/lib/billing/iyzico-signature'

describe('trailingZero', () => {
  it('fazladan sıfırları atar', () => {
    expect(trailingZero('10.50')).toBe('10.5')
    expect(trailingZero('10.00')).toBe('10.0')
    expect(trailingZero(10)).toBe('10.0')
    expect(trailingZero('1200.000')).toBe('1200.0')
  })

  it('anlamlı basamakları korur', () => {
    expect(trailingZero('10.05')).toBe('10.05')
    expect(trailingZero('0.99')).toBe('0.99')
  })

  it('string ile sayı aynı sonucu verir', () => {
    // Kritik: veritabanından string, koddan sayı gelir. İkisi farklı
    // string üretirse imza tutmaz ve hata "ödeme reddedildi" gibi görünür.
    expect(trailingZero('1499.90')).toBe(trailingZero(1499.9))
  })

  it('bilimsel gösterime kaçmaz', () => {
    expect(trailingZero(0.0001)).toBe('0.0001')
  })

  it('geçersiz fiyatı sessizce geçirmez', () => {
    expect(() => trailingZero('abc')).toThrow()
  })
})

describe('buildAuthorizationHeader', () => {
  const base = {
    apiKey: 'sandbox-apikey',
    secretKey: 'sandbox-secret',
    randomKey: '1722246017090123456789',
    uriPath: '/payment/iyzipos/checkoutform/initialize/auth/ecom',
    body: '{"price":"10.0"}',
  }

  it('IYZWSv2 ön ekiyle başlar', () => {
    expect(buildAuthorizationHeader(base).startsWith('IYZWSv2 ')).toBe(true)
  })

  it('base64 içeriği belgelenen alan biçimini taşır', () => {
    const header = buildAuthorizationHeader(base)
    const decoded = Buffer.from(header.slice('IYZWSv2 '.length), 'base64').toString('utf8')

    expect(decoded).toMatch(
      /^apiKey:sandbox-apikey&randomKey:1722246017090123456789&signature:[0-9a-f]{64}$/
    )
  })

  it('imza HMAC-SHA256(randomKey + uriPath + body, secretKey) hex', () => {
    // Dokümandaki formülü bağımsız olarak yeniden hesaplayıp karşılaştırır:
    // fonksiyonun kendi mantığını tekrarlamak yerine sözleşmeyi kilitler.
    const expected = createHmac('sha256', base.secretKey)
      .update(base.randomKey + base.uriPath + base.body)
      .digest('hex')

    const decoded = Buffer.from(
      buildAuthorizationHeader(base).slice('IYZWSv2 '.length),
      'base64'
    ).toString('utf8')

    expect(decoded).toContain(`signature:${expected}`)
  })

  it('gövde değişince imza değişir', () => {
    const a = buildAuthorizationHeader(base)
    const b = buildAuthorizationHeader({ ...base, body: '{"price":"11.0"}' })
    expect(a).not.toBe(b)
  })

  it('yol değişince imza değişir', () => {
    // Aynı gövdeyi başka bir uca göndermek imzayı geçersiz kılmalı.
    const a = buildAuthorizationHeader(base)
    const b = buildAuthorizationHeader({ ...base, uriPath: '/payment/auth' })
    expect(a).not.toBe(b)
  })

  it('secretKey değişince imza değişir', () => {
    const a = buildAuthorizationHeader(base)
    const b = buildAuthorizationHeader({ ...base, secretKey: 'baska-secret' })
    expect(a).not.toBe(b)
  })
})

describe('generateRandomKey', () => {
  it('her çağrıda farklı değer üretir', () => {
    // Tekrarlanan randomKey, tekrar saldırısına kapı açar.
    const keys = new Set(Array.from({ length: 200 }, () => generateRandomKey()))
    expect(keys.size).toBe(200)
  })

  it('zaman damgasıyla başlar', () => {
    expect(generateRandomKey(1722246017090).startsWith('1722246017090')).toBe(true)
  })
})

describe('verifyResponseSignature', () => {
  const secretKey = 'sandbox-secret'
  const fields = ['SUCCESS', '12345', 'TRY', 'B1', 'C1', '1499.0', '1499.0', 'tok']

  function sign(f: (string | null)[], key = secretKey) {
    return createHmac('sha256', key).update(f.join(':')).digest('hex')
  }

  it('doğru imzayı kabul eder', () => {
    expect(
      verifyResponseSignature({ secretKey, fields, expected: sign(fields) })
    ).toBe(true)
  })

  it('yanlış imzayı reddeder', () => {
    expect(
      verifyResponseSignature({ secretKey, fields, expected: sign(fields, 'baska') })
    ).toBe(false)
  })

  it('tek alan değişince reddeder', () => {
    // Saldırganın en cazip hamlesi: tutarı düşürüp imzayı korumak.
    const tampered = [...fields]
    tampered[5] = '1.0'
    expect(
      verifyResponseSignature({ secretKey, fields: tampered, expected: sign(fields) })
    ).toBe(false)
  })

  it('imza yoksa reddeder', () => {
    // İmzasız bir callback'e "başarılı" demek bedava abonelik demektir.
    expect(verifyResponseSignature({ secretKey, fields, expected: null })).toBe(false)
    expect(verifyResponseSignature({ secretKey, fields, expected: '' })).toBe(false)
  })

  it('farklı uzunluktaki imzada patlamaz', () => {
    // timingSafeEqual farklı uzunlukta istisna fırlatır; erken dönülmeli.
    expect(verifyResponseSignature({ secretKey, fields, expected: 'kisa' })).toBe(false)
  })

  it('null alanı boş string sayar', () => {
    expect(
      verifyResponseSignature({
        secretKey,
        fields: ['A', null, 'B'],
        expected: sign(['A', '', 'B']),
      })
    ).toBe(true)
  })
})

describe('checkoutFormRetrieveSignatureFields', () => {
  it('dokümandaki sırayı korur', () => {
    const fields = checkoutFormRetrieveSignatureFields({
      paymentStatus: 'SUCCESS',
      paymentId: '123',
      currency: 'TRY',
      basketId: 'B1',
      conversationId: 'C1',
      paidPrice: '1499.00',
      price: '1499.00',
      token: 'tok',
    })

    expect(fields).toEqual([
      'SUCCESS',
      '123',
      'TRY',
      'B1',
      'C1',
      '1499.0',
      '1499.0',
      'tok',
    ])
  })

  it('fiyatları trailingZero biçimine getirir', () => {
    const fields = checkoutFormRetrieveSignatureFields({ paidPrice: 10.5, price: '10.50' })
    expect(fields[5]).toBe('10.5')
    expect(fields[6]).toBe('10.5')
  })
})

describe('verifySubscriptionWebhookSignature', () => {
  const base = {
    merchantId: '123456',
    secretKey: 'sandbox-secret',
    eventType: 'subscription.order.success',
    subscriptionReferenceCode: 'SUB-1',
    orderReferenceCode: 'ORD-1',
    customerReferenceCode: 'CUS-1',
  }

  function sign(o: typeof base, key = base.secretKey) {
    return createHmac('sha256', key)
      .update(
        o.merchantId +
          o.secretKey +
          o.eventType +
          o.subscriptionReferenceCode +
          o.orderReferenceCode +
          o.customerReferenceCode
      )
      .digest('hex')
  }

  it('doğru imzayı kabul eder', () => {
    expect(
      verifySubscriptionWebhookSignature({ ...base, expected: sign(base) })
    ).toBe(true)
  })

  it('alan sırası dokümandaki gibi', () => {
    // Bağımsız hesap: fonksiyonun mantığını tekrarlamak yerine
    // sözleşmeyi kilitler. Sıra değişirse bu test kırılır.
    const expected = createHmac('sha256', base.secretKey)
      .update('123456sandbox-secretsubscription.order.successSUB-1ORD-1CUS-1')
      .digest('hex')
    expect(verifySubscriptionWebhookSignature({ ...base, expected })).toBe(true)
  })

  it('olay türü değişince reddeder', () => {
    // Saldırganın en cazip hamlesi: failure'ı success'e çevirmek.
    expect(
      verifySubscriptionWebhookSignature({
        ...base,
        eventType: 'subscription.order.failure',
        expected: sign(base),
      })
    ).toBe(false)
  })

  it('abonelik referansı değişince reddeder', () => {
    // Başka birinin aboneliğini kendi hesabına bağlamak.
    expect(
      verifySubscriptionWebhookSignature({
        ...base,
        subscriptionReferenceCode: 'SUB-2',
        expected: sign(base),
      })
    ).toBe(false)
  })

  it('yanlış secretKey ile imzalanmışı reddeder', () => {
    expect(
      verifySubscriptionWebhookSignature({ ...base, expected: sign(base, 'baska') })
    ).toBe(false)
  })

  it('imza yoksa reddeder', () => {
    // İmzasız bir webhook'a inanmak bedava abonelik dağıtmaktır.
    expect(verifySubscriptionWebhookSignature({ ...base, expected: null })).toBe(false)
    expect(verifySubscriptionWebhookSignature({ ...base, expected: '' })).toBe(false)
  })

  it('farklı uzunluktaki imzada patlamaz', () => {
    expect(verifySubscriptionWebhookSignature({ ...base, expected: 'kisa' })).toBe(false)
  })

  it('eksik alanları boş string sayar', () => {
    const o = { ...base, orderReferenceCode: null }
    const expected = createHmac('sha256', base.secretKey)
      .update('123456sandbox-secretsubscription.order.successSUB-1CUS-1')
      .digest('hex')
    expect(verifySubscriptionWebhookSignature({ ...o, expected })).toBe(true)
  })
})
