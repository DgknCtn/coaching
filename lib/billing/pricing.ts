import type { PlanId } from '@/lib/plans'

// FİYATLANDIRMA — saf hesap katmanı.
//
// TÜRK LİRASI KURUŞ CİNSİNDEN TUTULUR. Kayan noktalı sayıyla para
// tutmak, 1499.90 * 12'nin 17998.800000000001 çıktığı bir dünyada
// faturaya yanlış rakam yazmaktır. Tüm hesap tam sayıyla yapılır, yalnız
// gösterim ve iyzico'ya gönderim anında ondalığa çevrilir.
//
// MODEL: aylık + yıllık, İKİSİ DE TEK ÇEKİM.
//
// TAKSİT KALDIRILDI (057). Ürün kararı olmasının yanında teknik zorunluluk
// hâline de geldi: abonelik artık yinelenen bir tahsilat ve taksit tek
// seferlik bir çekimi böler — yinelenen tahsilatta uygulanamaz.
// Yıllık paket indirimiyle KALIYOR; indirim taksitten bağımsız ve nakit
// akışını öne alıyor.

/** Satın alınabilir planlar. `trial` ücretsiz, `institution` görüşmeye tabi. */
export type PayablePlanId = Extract<PlanId, 'starter' | 'coach'>

export type BillingPeriod = 'monthly' | 'yearly'

export interface PlanPricing {
  /** Aylık abonelik bedeli (kuruş). */
  monthlyKurus: number
  /**
   * Yıllık paket bedeli (kuruş) — 12 aylıktan UCUZ olmalı.
   * İndirim, yıllık taahhüdün karşılığıdır ve `yearlyDiscountPercent`
   * ile vitrinde gösterilir.
   */
  yearlyKurus: number
}

/**
 * FİYATLAR — yer tutucu değil, ürünün gerçek etiketi.
 *
 * Kuruş cinsinden: 49900 = 499,00 TL.
 *
 * DEĞİŞTİRMEDEN ÖNCE: bu sayılar `/kosullar` ve fiyat bölümünde
 * gösteriliyor. Yayına çıkmış bir fiyatı değiştirmek, mevcut abonelerin
 * yenileme bedelini değiştirmek demektir; eski aboneler için ayrı bir
 * "fiyat kilidi" kararı gerekir (bugün yok, yayına çıkmadan önce
 * verilmeli).
 */
export const PLAN_PRICING: Record<PayablePlanId, PlanPricing> = {
  starter: {
    monthlyKurus: 49900,
    // 10 ay fiyatına 12 ay: iki ay bedava, %16,7 indirim.
    yearlyKurus: 499000,
  },
  coach: {
    monthlyKurus: 99900,
    yearlyKurus: 999000,
  },
}

/** KDV oranı. SaaS hizmeti Türkiye'de genel orana tabidir. */
export const VAT_RATE = 0.20

/** Kuruşu iyzico'nun beklediği ondalık string'e çevirir: 49900 -> "499.0" */
export function kurusToPriceString(kurus: number): string {
  if (!Number.isInteger(kurus) || kurus < 0) {
    throw new Error(`Geçersiz kuruş tutarı: ${kurus}`)
  }

  const lira = Math.floor(kurus / 100)
  const remainder = kurus % 100

  if (remainder === 0) return `${lira}.0`
  if (remainder % 10 === 0) return `${lira}.${remainder / 10}`
  return `${lira}.${String(remainder).padStart(2, '0')}`
}

/** Kullanıcıya gösterilecek biçim: 49900 -> "499,00 ₺" */
export function formatKurus(kurus: number): string {
  return `${(kurus / 100).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₺`
}

export function priceFor(plan: PayablePlanId, period: BillingPeriod): number {
  const pricing = PLAN_PRICING[plan]
  return period === 'monthly' ? pricing.monthlyKurus : pricing.yearlyKurus
}

/**
 * Yıllık almanın aylığa göre yüzde kaç kazandırdığı.
 *
 * Aşağı yuvarlanır: "%17 indirim" deyip %16,7 vermek, küçük ama gerçek
 * bir yanlış beyandır.
 */
export function yearlyDiscountPercent(plan: PayablePlanId): number {
  const { monthlyKurus, yearlyKurus } = PLAN_PRICING[plan]
  const twelveMonths = monthlyKurus * 12
  if (twelveMonths === 0) return 0
  return Math.floor(((twelveMonths - yearlyKurus) / twelveMonths) * 100)
}

/** Yıllık paketin aya bölünmüş hâli — vitrinde "ayda X ₺" için. */
export function yearlyPerMonthKurus(plan: PayablePlanId): number {
  return Math.round(PLAN_PRICING[plan].yearlyKurus / 12)
}

/**
 * KDV dahil tutardan KDV'yi ayırır.
 *
 * Yayınlanan fiyatlar KDV DAHİLDİR (Türkiye'de tüketiciye yönelik satışta
 * zorunlu). Fatura için matrah ile KDV'nin ayrı gösterilmesi gerekiyor.
 *
 * Yuvarlama kuruşta yapılır ve matrah + KDV toplamı HER ZAMAN brüt tutara
 * eşit olur — KDV'yi ayrı yuvarlayıp toplamak, faturada bir kuruşluk
 * tutarsızlık bırakırdı.
 */
export function splitVat(grossKurus: number): { netKurus: number; vatKurus: number } {
  const netKurus = Math.round(grossKurus / (1 + VAT_RATE))
  return { netKurus, vatKurus: grossKurus - netKurus }
}
