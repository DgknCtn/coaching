import { createHmac, timingSafeEqual } from 'node:crypto'

// IYZICO İMZALAMA — saf kripto katmanı.
//
// NEDEN AYRI MODÜL: bu dosyanın tamamı saf fonksiyon. Ağ yok, ortam
// değişkeni yok, Supabase yok. Sebep, entegrasyonun EN RİSKLİ parçasının
// burası olması: imza bir karakter yanlışsa hiçbir istek geçmez ve hata
// mesajı "yetkisiz"den ibaret kalır. Saf olduğu için test edilebiliyor.
//
// KAYNAK: iyzico HMACSHA256 kimlik doğrulama ve yanıt imzası doğrulama
// dokümanları (docs.iyzico.com). Şema hafızadan yazılmadı, dokümandan
// alındı — ödeme entegrasyonunda "galiba böyleydi" kabul edilemez.

/**
 * Fiyatı iyzico'nun beklediği biçime getirir.
 *
 * KURAL (dokümandan): imzaya giren fiyat alanları "trailingZero" biçiminde
 * olmalı — 10.50 -> 10.5, 10.00 -> 10.0, 10 -> 10.0.
 *
 * NEDEN TEHLİKELİ: JavaScript'te 10.50 zaten "10.5" olarak yazılır ama
 * veritabanından string olarak gelen "10.50" öyle kalır. İki taraf farklı
 * string üretirse imza tutmaz ve hata, ödeme reddi olarak görünür —
 * biçimlendirme hatası olarak değil. Bu yüzden tek yerden geçiyor.
 */
export function trailingZero(price: string | number): string {
  const asNumber = typeof price === 'number' ? price : Number(price)
  if (!Number.isFinite(asNumber)) {
    throw new Error(`Geçersiz fiyat: ${price}`)
  }

  // Önce ondalık gösterime çevir (bilimsel gösterimden kaçınmak için
  // makul bir basamak sayısıyla), sonra fazladan sıfırları at.
  let text = asNumber.toFixed(8)
  text = text.replace(/0+$/, '')

  // En az bir ondalık basamak kalmalı: "10." ya da "10" değil, "10.0".
  if (text.endsWith('.')) text += '0'
  if (!text.includes('.')) text += '.0'

  return text
}

/**
 * IYZWSv2 Authorization başlığını üretir.
 *
 * signature = HMAC-SHA256(randomKey + uriPath + body, secretKey)  [hex]
 * auth      = "apiKey:<k>&randomKey:<r>&signature:<s>"            [base64]
 * header    = "IYZWSv2 <auth>"
 *
 * uriPath GÖVDEYE DAHİL: aynı gövdeyi başka bir uca göndermek imzayı
 * geçersiz kılar. Bu yüzden çağıran taraf yolu elle yazmamalı, isteği
 * yapan fonksiyondan almalı.
 */
export function buildAuthorizationHeader(params: {
  apiKey: string
  secretKey: string
  /** Her istekte benzersiz. Tekrarlanan bir değer tekrar saldırısına açar. */
  randomKey: string
  /** Yalnız yol: "/payment/iyzipos/checkoutform/initialize/auth/ecom" */
  uriPath: string
  /** İsteğin gövdesi — GÖNDERİLENİN AYNISI olmalı, yeniden serileştirilmiş hâli değil. */
  body: string
}): string {
  const { apiKey, secretKey, randomKey, uriPath, body } = params

  const signature = createHmac('sha256', secretKey)
    .update(randomKey + uriPath + body)
    .digest('hex')

  const authorization = `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`

  return `IYZWSv2 ${Buffer.from(authorization, 'utf8').toString('base64')}`
}

/** Her istek için benzersiz rastgele anahtar. */
export function generateRandomKey(now: number = Date.now()): string {
  // iyzico örnekleri zaman damgası + rastgele son ek biçimini kullanıyor.
  const suffix = Math.floor(Math.random() * 1_000_000_000)
    .toString()
    .padStart(9, '0')
  return `${now}${suffix}`
}

/**
 * Yanıt imzasını doğrular.
 *
 * NEDEN ZORUNLU: callback'e gelen isteği başkası da yapabilir. İmza
 * doğrulanmadan "ödeme başarılı" bilgisine güvenmek, herhangi birinin
 * tarayıcısından bize sahte başarı bildirmesi demektir — yani bedava
 * abonelik. Bu fonksiyon çağrılmadan hiçbir ödeme kaydı işlenmemeli.
 *
 * Alanlar ':' ile birleştirilip secretKey ile HMAC-SHA256 (hex) alınır.
 * Sıra ÖNEMLİ ve uca göre değişir; çağıran doğru sırayı verir.
 */
export function verifyResponseSignature(params: {
  secretKey: string
  /** Doğru SIRADA alanlar. Fiyat alanları trailingZero'dan geçirilmiş olmalı. */
  fields: (string | number | null | undefined)[]
  /** Yanıttaki `signature` değeri. */
  expected: string | null | undefined
  /**
   * Hazır hesaplanmış imza. Farklı bir alan birleştirme kuralı kullanan
   * uçlar (ör. abonelik webhook'u) bunu geçer; böylece sabit zamanlı
   * karşılaştırma tek yerde kalır ve iki ayrı yerde tekrarlanmaz.
   */
  precomputed?: string
}): boolean {
  const { secretKey, fields, expected, precomputed } = params

  if (!expected) return false

  const hashString = fields.map(f => (f == null ? '' : String(f))).join(':')

  const actual =
    precomputed ?? createHmac('sha256', secretKey).update(hashString).digest('hex')

  // Sabit zamanlı karşılaştırma: '===' karakter karakter erken çıkar ve
  // imzayı byte byte tahmin etmeye açık kapı bırakır.
  const a = Buffer.from(actual, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Checkout Form sorgulama (retrieve) yanıtı için imza alan sırası.
 *
 * Dokümandaki sıra birebir: paymentStatus, paymentId, currency, basketId,
 * conversationId, paidPrice, price, token.
 *
 * SIRA SABİT DEĞİL DİYE AYRI FONKSİYON: her ucun kendi sırası var ve
 * sırayı çağırma yerinde elle dizmek, bir ucu düzeltirken diğerini sessizce
 * bozmanın en kolay yolu.
 */
export function checkoutFormRetrieveSignatureFields(response: {
  paymentStatus?: string | null
  paymentId?: string | null
  currency?: string | null
  basketId?: string | null
  conversationId?: string | null
  paidPrice?: string | number | null
  price?: string | number | null
  token?: string | null
}): (string | null | undefined)[] {
  return [
    response.paymentStatus,
    response.paymentId,
    response.currency,
    response.basketId,
    response.conversationId,
    response.paidPrice == null ? null : trailingZero(response.paidPrice),
    response.price == null ? null : trailingZero(response.price),
    response.token,
  ]
}

/**
 * Abonelik webhook imzasını doğrular (V3).
 *
 * NEDEN BURADA: bu dosya saf ve test edilebilir. İmza hesabı
 * `server-only` bir modülde kalsaydı testten geçemezdi — ve webhook
 * imzası, ödeme yolundaki en kritik kontrol.
 *
 * Sağlayıcı belgesindeki alan sırası:
 *   merchantId + secretKey + eventType +
 *   subscriptionReferenceCode + orderReferenceCode + customerReferenceCode
 * HMAC-SHA256, secretKey ile, hex.
 *
 * Bu uç herkese açık ve gövdesi tamamen istemci kontrolünde: imza
 * doğrulanmadan gelen bir "ödeme başarılı" bildirimine inanmak, herkese
 * bedava abonelik dağıtmaktır.
 */
export function verifySubscriptionWebhookSignature(params: {
  merchantId: string
  secretKey: string
  eventType: string | null | undefined
  subscriptionReferenceCode: string | null | undefined
  orderReferenceCode: string | null | undefined
  customerReferenceCode: string | null | undefined
  expected: string | null | undefined
}): boolean {
  const hashString =
    params.merchantId +
    params.secretKey +
    (params.eventType ?? '') +
    (params.subscriptionReferenceCode ?? '') +
    (params.orderReferenceCode ?? '') +
    (params.customerReferenceCode ?? '')

  const actual = createHmac('sha256', params.secretKey).update(hashString).digest('hex')

  // Sabit zamanlı karşılaştırma için mevcut yardımcı yeniden kullanılıyor:
  // uzunluk kontrolü ve timingSafeEqual tek yerde dursun.
  return verifyResponseSignature({
    secretKey: params.secretKey,
    fields: [],
    expected: params.expected,
    precomputed: actual,
  })
}
