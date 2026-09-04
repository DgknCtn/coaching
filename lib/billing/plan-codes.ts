import 'server-only'

import type { PayablePlanId, BillingPeriod } from './pricing'

// SAĞLAYICI FİYAT PLANI REFERANSLARI.
//
// Yinelenen abonelikte sağlayıcı, kendi tarafında tanımlı bir "fiyat planı"
// ister. Dört kombinasyonumuz var: (starter | coach) × (monthly | yearly).
//
// NEDEN TABLO DEĞİL ORTAM DEĞİŞKENİ: bunlar çalışma zamanı verisi değil,
// DAĞITIM YAPILANDIRMASI. Sandbox ve canlı ortamda farklı değerler alırlar
// ve bir kiracıya göre değişmezler. Veritabanına konsalardı, iki ortamın
// veritabanı içerikleri birbirinden ayrışırdı.
//
// NEDEN EKSİKTE PATLIYOR: yanlış ya da eksik bir referans kodu, ödeme
// adımının sessizce çalışmaması demek. Kullanıcı kart bilgisini girip
// hiçbir şey olmadığını görür. Yapılandırma hatası yüksek sesle,
// kullanıcıya ulaşmadan patlamalı.

const ENV_KEYS: Record<PayablePlanId, Record<BillingPeriod, string>> = {
  starter: {
    monthly: 'IYZICO_PLAN_STARTER_MONTHLY',
    yearly: 'IYZICO_PLAN_STARTER_YEARLY',
  },
  coach: {
    monthly: 'IYZICO_PLAN_COACH_MONTHLY',
    yearly: 'IYZICO_PLAN_COACH_YEARLY',
  },
}

/**
 * Plan + döneme karşılık gelen sağlayıcı fiyat planı referansı.
 *
 * @throws Yapılandırma eksikse — sessizce boş dönmez.
 */
export function pricingPlanReferenceCode(
  plan: PayablePlanId,
  period: BillingPeriod
): string {
  const key = ENV_KEYS[plan][period]
  const value = process.env[key]

  if (!value) {
    throw new Error(
      `Abonelik fiyat planı referansı tanımlı değil: ${key}. ` +
        'Sağlayıcı panelinde plan oluşturulup referans kodu ortama yazılmalı.'
    )
  }

  return value
}

/**
 * Referans kodundan plan ve döneme geri dönüş.
 *
 * Webhook yalnız referans kodları taşır; hangi planın yenilendiğini
 * anlamanın yolu bu. Tanınmayan kod `null` döner ve çağıran taraf
 * işlemi reddeder — tanımadığımız bir plana abonelik açmayız.
 */
export function planFromReferenceCode(
  code: string
): { plan: PayablePlanId; period: BillingPeriod } | null {
  for (const plan of ['starter', 'coach'] as PayablePlanId[]) {
    for (const period of ['monthly', 'yearly'] as BillingPeriod[]) {
      if (process.env[ENV_KEYS[plan][period]] === code) {
        return { plan, period }
      }
    }
  }
  return null
}
