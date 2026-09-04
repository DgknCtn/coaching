import 'server-only'

import {
  buildAuthorizationHeader,
  generateRandomKey,
  verifyResponseSignature,
  checkoutFormRetrieveSignatureFields,
} from './iyzico-signature'
import { kurusToPriceString } from './pricing'

// IYZICO İSTEMCİSİ — sağlayıcıya özel TEK dosya.
//
// Şemada, iş mantığında ve ekranlarda "iyzico" geçmiyor; sağlayıcıya özgü
// her şey burada. Sebep: ödeme sağlayıcısı değiştirmek bir SaaS'ın
// hayatında olağan bir olay ve her yere dağılmış bir entegrasyon o günü
// bir göç projesine çevirir.
//
// ============================================================
// NEDEN RESMÎ SDK (iyzipay) KULLANILMIYOR
//
// Resmî Node paketi geri çağırma (callback) tabanlı, tipsiz ve Edge/
// serverless ortamlarında sorun çıkarabilen bir tasarıma sahip. İhtiyacımız
// olan yüzey ise iki uçtan ibaret: formu başlat, sonucu sorgula. İkisini
// `fetch` ile yazmak, bir bağımlılığın bakımını üstlenmekten hem daha az
// kod hem daha az risk.
//
// NEDEN SANDBOX VARSAYILAN DEĞİL
//
// Ortam değişkeni eksikse SANDBOX'a düşmek cazip görünür ama tersi
// doğrudur: canlıda eksik yapılandırma, gerçek ödemelerin sessizce test
// ortamına gitmesi demek olurdu. Eksik yapılandırmada patlıyoruz.
// ============================================================

const CHECKOUT_INITIALIZE_PATH = '/payment/iyzipos/checkoutform/initialize/auth/ecom'
const CHECKOUT_RETRIEVE_PATH = '/payment/iyzipos/checkoutform/auth/ecom/detail'

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
 * GÖVDE BİR KEZ SERİLEŞTİRİLİR ve hem imzaya hem gövdeye AYNI string
 * gider. `JSON.stringify` iki kez çağrılırsa anahtar sırası aynı kalsa
 * bile bu bir varsayıma dayanmak olurdu; imza tutmadığında hata
 * "yetkisiz"den ibaret kalır ve saatler yakar.
 */
async function request<T>(path: string, payload: unknown): Promise<T> {
  const { apiKey, secretKey, baseUrl } = getConfig()

  const body = JSON.stringify(payload)
  const randomKey = generateRandomKey()

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
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
    body,
    // Ödeme uçlarında önbellek felakettir: eski bir form belirtecini
    // yeniden sunmak, kullanıcıyı ölü bir ödeme oturumuna gönderir.
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`iyzico isteği başarısız (HTTP ${res.status})`)
  }

  return (await res.json()) as T
}

export interface CheckoutFormSession {
  status: string
  token?: string
  /** Kullanıcının yönlendirileceği barındırılan ödeme sayfası. */
  paymentPageUrl?: string
  errorMessage?: string
  errorCode?: string
}

export interface InitializeCheckoutParams {
  /** Bizim sipariş kimliğimiz — sonucu buna bağlıyoruz. */
  orderId: string
  grossKurus: number
  planName: string
  callbackUrl: string
  buyer: {
    id: string
    name: string
    surname: string
    email: string
    /** Kimlik numarası zorunlu alan; gerçek veri yoksa iyzico'nun test değeri. */
    identityNumber: string
    registrationAddress: string
    city: string
    country: string
    ip: string
  }
}

/**
 * Ödeme formunu başlatır ve barındırılan sayfanın adresini döner.
 *
 * BARINDIRILAN SAYFA (paymentPageUrl) TERCİH EDİLDİ: kart bilgisi bizim
 * sayfamıza hiç girilmez. Alternatif olan gömülü form, kart alanlarının
 * bizim DOM'umuzda durması demektir ve PCI-DSS kapsamını genişletir.
 */
export async function initializeCheckoutForm(
  params: InitializeCheckoutParams
): Promise<CheckoutFormSession> {
  const price = kurusToPriceString(params.grossKurus)

  return request<CheckoutFormSession>(CHECKOUT_INITIALIZE_PATH, {
    locale: 'tr',
    // Sipariş kimliğimiz iki alanda birden gidiyor: conversationId
    // callback'te geri döner, basketId ise imza alanlarına girer.
    conversationId: params.orderId,
    basketId: params.orderId,
    price,
    paidPrice: price,
    currency: 'TRY',
    paymentGroup: 'PRODUCT',
    callbackUrl: params.callbackUrl,
    // TAKSİT YOK (057): tek çekim. enabledInstallments gönderilmiyor;
    // boş ya da [1] göndermekle aynı sonucu verir ama niyeti daha açık
    // anlatır.
    buyer: {
      id: params.buyer.id,
      name: params.buyer.name,
      surname: params.buyer.surname,
      email: params.buyer.email,
      identityNumber: params.buyer.identityNumber,
      registrationAddress: params.buyer.registrationAddress,
      city: params.buyer.city,
      country: params.buyer.country,
      ip: params.buyer.ip,
    },
    // Dijital hizmet: fiziksel teslimat yok. Alan yine de zorunlu
    // olduğu için fatura adresiyle aynı doldurulur.
    billingAddress: {
      contactName: `${params.buyer.name} ${params.buyer.surname}`.trim(),
      city: params.buyer.city,
      country: params.buyer.country,
      address: params.buyer.registrationAddress,
    },
    basketItems: [
      {
        id: params.orderId,
        name: params.planName,
        category1: 'Yazılım Hizmeti',
        // Dijital abonelik: fiziksel ürün değil.
        itemType: 'VIRTUAL',
        price,
      },
    ],
  })
}

export interface CheckoutFormResult {
  status: string
  paymentStatus?: string
  paymentId?: string
  currency?: string
  basketId?: string
  conversationId?: string
  paidPrice?: string
  price?: string
  token?: string
  signature?: string
  errorMessage?: string
}

/**
 * Ödemenin GERÇEKTEN gerçekleştiğini sağlayıcıya sorar.
 *
 * ============================================================
 * NEDEN CALLBACK'İN İÇERİĞİNE GÜVENİLMEZ
 *
 * Callback'e gelen POST'u herhangi biri taklit edebilir. "status=success"
 * yazan bir isteğe inanmak, tarayıcısından sahte başarı bildiren herkese
 * bedava abonelik vermektir. Bu yüzden callback'ten YALNIZ belirteç
 * alınır, sonuç sağlayıcının kendisine sorulur ve dönen yanıtın imzası
 * ayrıca doğrulanır.
 * ============================================================
 */
export async function retrieveCheckoutResult(token: string): Promise<CheckoutFormResult> {
  return request<CheckoutFormResult>(CHECKOUT_RETRIEVE_PATH, {
    locale: 'tr',
    token,
  })
}

/**
 * Sorgulama yanıtının imzasını doğrular.
 *
 * İmza doğrulanmadan hiçbir sipariş 'paid' yapılmamalı — sağlayıcıya
 * yapılan isteğin yanıtı yolda değiştirilmiş olabilir.
 */
export function verifyCheckoutResult(result: CheckoutFormResult): boolean {
  const { secretKey } = getConfig()

  return verifyResponseSignature({
    secretKey,
    fields: checkoutFormRetrieveSignatureFields(result),
    expected: result.signature,
  })
}

/** Ödemenin başarılı sayılması için sağlanması gereken tek koşul kümesi. */
export function isPaymentSuccessful(result: CheckoutFormResult): boolean {
  return result.status === 'success' && result.paymentStatus === 'SUCCESS'
}
