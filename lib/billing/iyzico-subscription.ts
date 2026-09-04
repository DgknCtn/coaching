import 'server-only'

import {
  buildAuthorizationHeader,
  generateRandomKey,
  verifySubscriptionWebhookSignature,
} from './iyzico-signature'

// IYZICO ABONELİK — BETA API'yi izole eden TEK dosya.
//
// ============================================================
// NEDEN ABONELİK ÜRÜNÜ
//
// İstenen şey: kayıtta kart alınsın, deneme bitince otomatik çekilsin.
// Kartı KENDİ sayfamızda toplamak PCI-DSS kapsamına girmek demek —
// sağlayıcının kart saklama API'si ham kart numarası istiyor. Tek
// PCI-güvenli yol bu: barındırılan formda kart alınır, sağlayıcı kartı
// 1 TL çekip iade ederek doğrular, deneme bitince ve her yenilemede
// KENDİSİ çeker.
//
// Böylece zamanlayıcı, başarısız ödemede yeniden deneme ve batak takibi
// bizim kodumuz olmuyor. Paranın geçtiği yolda ne kadar az kendi kodumuz
// varsa o kadar iyi.
//
// ============================================================
// BETA UYARISI
//
// Abonelik API'si sağlayıcı tarafında BETA. Bu yüzden bağımlılık tek
// dosyada tutuluyor: uç değişirse ya da ürün emekliye ayrılırsa
// değişecek yer burası, uygulamanın geneli değil.
//
// Fiyat planları sağlayıcı panelinde bir kez tanımlanır ve referans
// kodları ortam değişkeninden okunur (lib/billing/plan-codes.ts).
// ============================================================

const SUBSCRIPTION_CHECKOUT_PATH = '/v2/subscription/checkoutform/initialize'

interface IyzicoConfig {
  apiKey: string
  secretKey: string
  baseUrl: string
}

function getConfig(): IyzicoConfig {
  const apiKey = process.env.IYZICO_API_KEY
  const secretKey = process.env.IYZICO_SECRET_KEY
  const baseUrl = process.env.IYZICO_BASE_URL

  if (!apiKey || !secretKey || !baseUrl) {
    throw new Error(
      'iyzico yapılandırması eksik (IYZICO_API_KEY / IYZICO_SECRET_KEY / IYZICO_BASE_URL).'
    )
  }

  return { apiKey, secretKey, baseUrl: baseUrl.replace(/\/$/, '') }
}

/**
 * İmzalı istek.
 *
 * GÖVDE BİR KEZ SERİLEŞTİRİLİR: aynı string hem imzaya hem gövdeye gider.
 * İki ayrı `JSON.stringify` çağrısı anahtar sırasının aynı kalacağı
 * varsayımına dayanmak olurdu ve imza tutmadığında hata "yetkisiz"den
 * ibaret kalır.
 */
async function request<T>(
  path: string,
  payload: unknown,
  method: 'POST' | 'GET' = 'POST'
): Promise<T> {
  const { apiKey, secretKey, baseUrl } = getConfig()

  const body = method === 'GET' ? '' : JSON.stringify(payload)
  const randomKey = generateRandomKey()

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: buildAuthorizationHeader({
        apiKey,
        secretKey,
        randomKey,
        uriPath: path,
        body,
      }),
      'x-iyzi-rnd': randomKey,
    },
    ...(method === 'POST' ? { body } : {}),
    // Ödeme uçlarında önbellek felakettir.
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`iyzico abonelik isteği başarısız (HTTP ${res.status})`)
  }

  return (await res.json()) as T
}

export interface SubscriptionCheckoutSession {
  status: string
  data?: {
    referenceCode?: string
    checkoutFormContent?: string
    token?: string
  }
  errorMessage?: string
  errorCode?: string
}

export interface InitializeSubscriptionParams {
  /** Sağlayıcıdaki fiyat planı referansı. */
  pricingPlanReferenceCode: string
  /** Bizim çalışma alanı kimliğimiz — sonucu buna bağlıyoruz. */
  conversationId: string
  callbackUrl: string
  customer: {
    name: string
    surname: string
    email: string
    identityNumber: string
    /** Sağlayıcı bu alanları zorunlu tutuyor. */
    billingAddress: { contactName: string; city: string; country: string; address: string }
  }
}

/**
 * Abonelik ödeme formunu başlatır.
 *
 * `subscriptionInitialStatus: 'ACTIVE'` + fiyat planında tanımlı deneme
 * süresi = kart alınır, TAHSİLAT YAPILMAZ, ilk çekim deneme sonunda olur.
 * Sağlayıcı bu aşamada kartı yalnız 1 TL provizyon + iade ile doğrular.
 */
export async function initializeSubscriptionCheckout(
  params: InitializeSubscriptionParams
): Promise<SubscriptionCheckoutSession> {
  return request<SubscriptionCheckoutSession>(SUBSCRIPTION_CHECKOUT_PATH, {
    locale: 'tr',
    conversationId: params.conversationId,
    callbackUrl: params.callbackUrl,
    pricingPlanReferenceCode: params.pricingPlanReferenceCode,
    subscriptionInitialStatus: 'ACTIVE',
    customer: {
      name: params.customer.name,
      surname: params.customer.surname,
      email: params.customer.email,
      identityNumber: params.customer.identityNumber,
      billingAddress: params.customer.billingAddress,
    },
  })
}

export interface SubscriptionDetail {
  status: string
  data?: {
    referenceCode?: string
    parentReferenceCode?: string
    pricingPlanReferenceCode?: string
    customerReferenceCode?: string
    subscriptionStatus?: string
    trialEndDate?: string
    startDate?: string
    endDate?: string
  }
  errorMessage?: string
}

/**
 * Aboneliği sağlayıcıya sorar.
 *
 * NEDEN: callback'e ve webhook'a gelen gövdeye tutar/plan için
 * GÜVENİLMEZ. Her ikisi de yalnız referans kodu taşımak için kullanılır;
 * gerçek durum buradan okunur. Mevcut tek çekim akışındaki desenin aynısı.
 */
export async function retrieveSubscription(
  subscriptionReferenceCode: string
): Promise<SubscriptionDetail> {
  return request<SubscriptionDetail>(
    `/v2/subscription/subscriptions/${encodeURIComponent(subscriptionReferenceCode)}`,
    null,
    'GET'
  )
}

/** Sağlayıcı tarafında aboneliği iptal eder (yenileme durur). */
export async function cancelProviderSubscription(
  subscriptionReferenceCode: string
): Promise<{ status: string; errorMessage?: string }> {
  return request(
    `/v2/subscription/subscriptions/${encodeURIComponent(subscriptionReferenceCode)}/cancel`,
    {}
  )
}

// WEBHOOK İMZASI — hesabın kendisi test edilebilir olsun diye saf
// modülde (iyzico-signature.ts). Burada yalnız ortam okunuyor.

export interface SubscriptionWebhookPayload {
  iyziEventType?: string
  subscriptionReferenceCode?: string
  orderReferenceCode?: string
  customerReferenceCode?: string
  iyziReferenceCode?: string
  iyziEventTime?: number
}

export function verifyWebhookSignature(
  payload: SubscriptionWebhookPayload,
  headerSignature: string | null
): boolean {
  if (!headerSignature) return false

  const secretKey = process.env.IYZICO_SECRET_KEY
  const merchantId = process.env.IYZICO_MERCHANT_ID

  if (!secretKey || !merchantId) {
    throw new Error(
      'Webhook imzası doğrulanamıyor: IYZICO_SECRET_KEY / IYZICO_MERCHANT_ID eksik.'
    )
  }

  return verifySubscriptionWebhookSignature({
    merchantId,
    secretKey,
    eventType: payload.iyziEventType,
    subscriptionReferenceCode: payload.subscriptionReferenceCode,
    orderReferenceCode: payload.orderReferenceCode,
    customerReferenceCode: payload.customerReferenceCode,
    expected: headerSignature,
  })
}
