// FİYATLANDIRMA — saf hesap katmanı.
//
// ============================================================
// MODEL: ÖN ÖDEMELİ LİSANS (058)
//
// Kullanıcı ÖĞRENCİ SAYISI ve KULLANIM SÜRESİ seçer, tek seferde öder,
// lisans o süre boyunca geçerlidir. Öğrenci başına maliyet ikisi de
// arttıkça düşer.
//
// Önceki model (Başlangıç/Koç planları, aylık yinelenen abonelik)
// tamamen kaldırıldı. Sebep yalnız ürün kararı değil: öğrenci sayısı ×
// ay kombinasyonu sınırsız olduğu için sağlayıcının abonelik ürünü
// kullanılamıyor — önceden tanımlı fiyat planı istiyor ve N×12 için plan
// üretilemez.
//
// TÜRK LİRASI KURUŞ CİNSİNDEN TUTULUR. Kayan noktalı sayıyla para
// tutmak, 1499.90 * 12'nin 17998.800000000001 çıktığı bir dünyada
// faturaya yanlış rakam yazmaktır. Tüm hesap tam sayıyla yapılır, yalnız
// gösterim ve sağlayıcıya gönderim anında ondalığa çevrilir.
// ============================================================

/**
 * Taban birim fiyat: 1.000,00 TL / öğrenci / ay, KDV dahil.
 *
 * 065'te 500,00 TL'den iki katına çıkarıldı. Sayı burada TEK KAYNAK:
 * vitrin, plan ekranı ve ön bilgilendirme formu hepsi bunu okur.
 * SQL tarafındaki karşılığı 065_price_double.sql içinde ve
 * tests/pricing-sql-parity.test.ts ikisinin ayrışmasını engelliyor.
 */
export const BASE_PER_STUDENT_MONTH_KURUS = 100_000

/** KDV oranı. SaaS hizmeti Türkiye'de genel orana tabidir. */
export const VAT_RATE = 0.2

/** Seçilebilecek en uzun süre. */
export const MAX_MONTHS = 12

/**
 * Self-servis satın almada üst sınır. Üstü "fiyat için görüşelim" —
 * bu ölçekte fiyat pazarlığa tabi ve sözleşme gerekiyor.
 */
export const MAX_SELF_SERVICE_STUDENTS = 500

/**
 * SÜRE İNDİRİMİ — her ay için ayrı, 1'den 12'ye.
 *
 * Aralık değil TAM TABLO: kullanıcı 12 ayın hepsini tek tek
 * seçebiliyor, dolayısıyla 7 ya da 11 ay da tanımlı olmak zorunda.
 * Aradaki değerleri formülle türetmek cazipti ama tablo, pazarlama
 * tarafının tek bir ayı elle değiştirebilmesini sağlıyor.
 *
 * MONOTON ARTMALI: uzun süre kısa süreden pahalıya gelemez. Test bunu
 * kilitliyor.
 */
export const DURATION_DISCOUNTS: Record<number, number> = {
  1: 0,
  2: 10,
  3: 15,
  4: 18,
  5: 21,
  6: 25,
  7: 27,
  8: 28,
  9: 30,
  10: 32,
  11: 33,
  12: 35,
}

/**
 * ADET İNDİRİMİ — kademeli.
 *
 * `minStudents` artan sırada; eşleşen SON kademe geçerlidir.
 */
export const VOLUME_DISCOUNTS: { minStudents: number; percent: number }[] = [
  { minStudents: 1, percent: 0 },
  { minStudents: 5, percent: 5 },
  { minStudents: 10, percent: 10 },
  { minStudents: 20, percent: 15 },
  { minStudents: 50, percent: 20 },
  { minStudents: 100, percent: 25 },
]

export interface Quote {
  studentCount: number
  months: number
  /** İndirimsiz tutar (kuruş) — "şu kadar kazandınız" için. */
  listGrossKurus: number
  /** Ödenecek tutar (kuruş), KDV dahil. */
  grossKurus: number
  /** Öğrenci başına aylık maliyet (kuruş) — vitrindeki asıl ikna edici sayı. */
  perStudentPerMonthKurus: number
  durationDiscountPercent: number
  volumeDiscountPercent: number
  /** Listeye göre gerçekleşen toplam indirim yüzdesi. */
  totalDiscountPercent: number
}

export function durationDiscountPercent(months: number): number {
  return DURATION_DISCOUNTS[months] ?? 0
}

export function volumeDiscountPercent(studentCount: number): number {
  let percent = 0
  for (const tier of VOLUME_DISCOUNTS) {
    if (studentCount >= tier.minStudents) percent = tier.percent
  }
  return percent
}

/**
 * Bir sonraki adet kademesi — "kaç öğrenci daha eklersen ne kazanırsın".
 *
 * NEDEN VAR: kademeli indirim, tablosu görünmediği sürece yalnız
 * ödemede fark edilen bir sürprizdir. 4 öğrenci seçen kullanıcı, bir
 * kişi daha eklediğinde %5 kazanacağını bilmiyor. Bu fonksiyon o eşiği
 * arayüzün söyleyebilmesi için hesaplar.
 *
 * En üst kademedeyken null döner — gösterilecek bir sonraki adım yok.
 */
export function nextVolumeTier(
  studentCount: number
): { minStudents: number; percent: number; needed: number } | null {
  const current = volumeDiscountPercent(studentCount)
  const next = VOLUME_DISCOUNTS.find(
    (t) => t.minStudents > studentCount && t.percent > current
  )
  if (!next) return null

  return { ...next, needed: next.minStudents - studentCount }
}

/**
 * Fiyat teklifi — fiyatlandırmanın TEK giriş noktası.
 *
 * YUVARLAMA TEK YERDE: indirim çarpımından sonra bir kez `Math.round`.
 * Önce birim fiyatı yuvarlayıp sonra çarpmak, toplam ile birim fiyatın
 * çeliştiği bir ekran üretirdi (10 öğrenci × 292,50 ≠ gösterilen toplam).
 * Bu yüzden toplam otoritedir, birim fiyat ondan TÜRETİLİR.
 *
 * @throws Geçersiz girdide — sessizce 0 döndürmek, bedava lisans demek.
 */
export function quote(studentCount: number, months: number): Quote {
  if (!Number.isInteger(studentCount) || studentCount < 1) {
    throw new Error(`Geçersiz öğrenci sayısı: ${studentCount}`)
  }
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    throw new Error(`Geçersiz süre: ${months}`)
  }

  const listGrossKurus = BASE_PER_STUDENT_MONTH_KURUS * studentCount * months

  const duration = durationDiscountPercent(months)
  const volume = volumeDiscountPercent(studentCount)

  const multiplier = ((100 - duration) / 100) * ((100 - volume) / 100)
  const grossKurus = Math.round(listGrossKurus * multiplier)

  return {
    studentCount,
    months,
    listGrossKurus,
    grossKurus,
    perStudentPerMonthKurus: Math.round(grossKurus / (studentCount * months)),
    durationDiscountPercent: duration,
    volumeDiscountPercent: volume,
    // AŞAĞI YUVARLANIR: "%43 indirim" deyip %42,6 vermek küçük ama
    // gerçek bir yanlış beyandır.
    totalDiscountPercent: Math.floor(
      ((listGrossKurus - grossKurus) / listGrossKurus) * 100
    ),
  }
}

/** Self-servis satın alınabilir mi, yoksa görüşme mi gerekiyor? */
export function isSelfService(studentCount: number): boolean {
  return studentCount >= 1 && studentCount <= MAX_SELF_SERVICE_STUDENTS
}

/** Kuruşu sağlayıcının beklediği ondalık string'e çevirir: 49900 -> "499.0" */
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

/** Ondalıksız kısa biçim — büyük tutarlarda tablo ve kart başlıkları için. */
export function formatKurusShort(kurus: number): string {
  return `${Math.round(kurus / 100).toLocaleString('tr-TR')} ₺`
}

/**
 * KDV dahil tutardan KDV'yi ayırır.
 *
 * Yayınlanan fiyatlar KDV DAHİLDİR (Türkiye'de tüketiciye yönelik satışta
 * zorunlu). Fatura için matrah ile KDV'nin ayrı gösterilmesi gerekiyor;
 * partner komisyonu da matrah üzerinden hesaplanır — KDV devlete gidiyor,
 * komisyon matrahına girmemeli.
 *
 * Yuvarlama kuruşta yapılır ve matrah + KDV toplamı HER ZAMAN brüt tutara
 * eşit olur — KDV'yi ayrı yuvarlayıp toplamak, faturada bir kuruşluk
 * tutarsızlık bırakırdı.
 */
export function splitVat(grossKurus: number): { netKurus: number; vatKurus: number } {
  const netKurus = Math.round(grossKurus / (1 + VAT_RATE))
  return { netKurus, vatKurus: grossKurus - netKurus }
}

/** Süre seçiminde gösterilecek ay listesi. */
export const MONTH_OPTIONS = Array.from({ length: MAX_MONTHS }, (_, i) => i + 1)
