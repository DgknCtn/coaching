import { describe, it, expect } from 'vitest'
import {
  BASE_PER_STUDENT_MONTH_KURUS,
  VAT_RATE,
  MAX_MONTHS,
  MAX_SELF_SERVICE_STUDENTS,
  DURATION_DISCOUNTS,
  VOLUME_DISCOUNTS,
  MONTH_OPTIONS,
  quote,
  durationDiscountPercent,
  volumeDiscountPercent,
  isSelfService,
  kurusToPriceString,
  formatKurus,
  formatKurusShort,
  splitVat,
} from '@/lib/billing/pricing'

describe('fiyat çapaları', () => {
  // Bu iki sayı ÜRÜN KARARI olarak verildi. Eğri bunlardan türetildi;
  // değişirlerse bilerek değişmeli, kazara değil.
  it('1 öğrenci × 1 ay = 500 TL', () => {
    expect(quote(1, 1).grossKurus).toBe(50_000)
  })

  it('1 öğrenci × 2 ay = 900 TL', () => {
    expect(quote(1, 2).grossKurus).toBe(90_000)
  })

  it('onaylanan örnek tablo birebir tutuyor', () => {
    expect(quote(1, 12).grossKurus).toBe(390_000) // 3.900 TL
    expect(quote(10, 1).grossKurus).toBe(450_000) // 4.500 TL
    expect(quote(10, 12).grossKurus).toBe(3_510_000) // 35.100 TL
    expect(quote(30, 12).grossKurus).toBe(9_945_000) // 99.450 TL
  })
})

describe('quote', () => {
  it('taban fiyat indirimsiz durumda birebir uygulanır', () => {
    expect(quote(1, 1).grossKurus).toBe(BASE_PER_STUDENT_MONTH_KURUS)
    expect(quote(4, 1).grossKurus).toBe(BASE_PER_STUDENT_MONTH_KURUS * 4)
  })

  it('her sonuç tam kuruş', () => {
    // Kesirli kuruş, faturada yuvarlama tartışması demektir.
    for (let n = 1; n <= 60; n++) {
      for (let m = 1; m <= MAX_MONTHS; m++) {
        expect(Number.isInteger(quote(n, m).grossKurus)).toBe(true)
      }
    }
  })

  it('toplam ile birim fiyat çelişmez', () => {
    // Birim fiyat toplamdan TÜRETİLİR; önce yuvarlayıp sonra çarpsaydık
    // "10 × 292,50" ile gösterilen toplam tutmazdı.
    for (const [n, m] of [[10, 12], [7, 5], [23, 9], [1, 1]] as const) {
      const q = quote(n, m)
      expect(q.perStudentPerMonthKurus).toBe(Math.round(q.grossKurus / (n * m)))
    }
  })

  it('süre uzadıkça öğrenci başına maliyet düşer (monoton)', () => {
    let previous = Infinity
    for (let m = 1; m <= MAX_MONTHS; m++) {
      const unit = quote(1, m).perStudentPerMonthKurus
      expect(unit).toBeLessThanOrEqual(previous)
      previous = unit
    }
  })

  it('öğrenci sayısı arttıkça öğrenci başına maliyet düşer (monoton)', () => {
    let previous = Infinity
    for (const n of [1, 4, 5, 9, 10, 19, 20, 49, 50, 99, 100, 250]) {
      const unit = quote(n, 1).perStudentPerMonthKurus
      expect(unit).toBeLessThanOrEqual(previous)
      previous = unit
    }
  })

  it('uzun süre kısa süreden pahalıya gelmez', () => {
    // Aksi hâlde 12 ay almak 11 aydan pahalı olurdu ve kullanıcı haklı
    // olarak sisteme güvenmezdi.
    for (let m = 2; m <= MAX_MONTHS; m++) {
      expect(quote(5, m).grossKurus).toBeGreaterThan(quote(5, m - 1).grossKurus)
    }
  })

  it('indirim yüzdesi aşağı yuvarlanır', () => {
    // "%43 indirim" deyip %42,6 vermek küçük ama gerçek bir yanlış beyan.
    for (const [n, m] of [[10, 12], [30, 12], [7, 6]] as const) {
      const q = quote(n, m)
      const real = ((q.listGrossKurus - q.grossKurus) / q.listGrossKurus) * 100
      expect(q.totalDiscountPercent).toBeLessThanOrEqual(real)
      expect(q.totalDiscountPercent).toBeGreaterThan(real - 1)
    }
  })

  it('indirimsiz tutar ödenecek tutardan büyük ya da eşit', () => {
    expect(quote(1, 1).listGrossKurus).toBe(quote(1, 1).grossKurus)
    expect(quote(10, 12).listGrossKurus).toBeGreaterThan(quote(10, 12).grossKurus)
  })

  it('geçersiz girdiyi sessizce geçirmez', () => {
    // Sessizce 0 döndürmek bedava lisans demektir.
    expect(() => quote(0, 1)).toThrow()
    expect(() => quote(-1, 1)).toThrow()
    expect(() => quote(1.5, 1)).toThrow()
    expect(() => quote(1, 0)).toThrow()
    expect(() => quote(1, 13)).toThrow()
    expect(() => quote(1, 2.5)).toThrow()
  })
})

describe('indirim tabloları', () => {
  it('12 ayın hepsi tanımlı', () => {
    // Kullanıcı ayları tek tek seçebiliyor; 7 ya da 11 ay tanımsız
    // kalırsa indirim sessizce sıfırlanırdı.
    for (let m = 1; m <= MAX_MONTHS; m++) {
      expect(DURATION_DISCOUNTS[m]).toBeTypeOf('number')
    }
    expect(MONTH_OPTIONS).toHaveLength(MAX_MONTHS)
  })

  it('süre indirimi monoton artar', () => {
    for (let m = 2; m <= MAX_MONTHS; m++) {
      expect(DURATION_DISCOUNTS[m]).toBeGreaterThanOrEqual(DURATION_DISCOUNTS[m - 1])
    }
  })

  it('adet indirimi kademeleri artan sırada', () => {
    for (let i = 1; i < VOLUME_DISCOUNTS.length; i++) {
      expect(VOLUME_DISCOUNTS[i].minStudents).toBeGreaterThan(
        VOLUME_DISCOUNTS[i - 1].minStudents
      )
      expect(VOLUME_DISCOUNTS[i].percent).toBeGreaterThan(VOLUME_DISCOUNTS[i - 1].percent)
    }
  })

  it('kademe sınırları doğru', () => {
    expect(volumeDiscountPercent(4)).toBe(0)
    expect(volumeDiscountPercent(5)).toBe(5)
    expect(volumeDiscountPercent(9)).toBe(5)
    expect(volumeDiscountPercent(10)).toBe(10)
    expect(volumeDiscountPercent(19)).toBe(10)
    expect(volumeDiscountPercent(20)).toBe(15)
    expect(volumeDiscountPercent(50)).toBe(20)
    expect(volumeDiscountPercent(100)).toBe(25)
    expect(volumeDiscountPercent(1000)).toBe(25)
  })

  it('süre indirimi bilinmeyen ayda sıfır', () => {
    expect(durationDiscountPercent(99)).toBe(0)
  })
})

describe('isSelfService', () => {
  it('üst sınıra kadar self-servis', () => {
    expect(isSelfService(1)).toBe(true)
    expect(isSelfService(MAX_SELF_SERVICE_STUDENTS)).toBe(true)
    expect(isSelfService(MAX_SELF_SERVICE_STUDENTS + 1)).toBe(false)
    expect(isSelfService(0)).toBe(false)
  })
})

describe('kurusToPriceString', () => {
  it('sağlayıcı biçimini üretir', () => {
    expect(kurusToPriceString(50_000)).toBe('500.0')
    expect(kurusToPriceString(3_510_000)).toBe('35100.0')
    expect(kurusToPriceString(49_950)).toBe('499.5')
    expect(kurusToPriceString(49_999)).toBe('499.99')
    expect(kurusToPriceString(5)).toBe('0.05')
    expect(kurusToPriceString(0)).toBe('0.0')
  })

  it('kayan noktalı hata üretmez', () => {
    const twelve = 149_990 * 12
    expect(twelve).toBe(1_799_880)
    expect(kurusToPriceString(twelve)).toBe('17998.8')
  })

  it('tam sayı olmayan kuruşu reddeder', () => {
    expect(() => kurusToPriceString(10.5)).toThrow()
    expect(() => kurusToPriceString(-100)).toThrow()
  })
})

describe('biçimlendirme', () => {
  it('Türkçe biçimde gösterir', () => {
    expect(formatKurus(50_000)).toBe('500,00 ₺')
    expect(formatKurus(3_510_000)).toBe('35.100,00 ₺')
  })

  it('kısa biçim ondalık göstermez', () => {
    expect(formatKurusShort(3_510_000)).toBe('35.100 ₺')
  })
})

describe('splitVat', () => {
  it('matrah ve KDV toplamı brüte eşit', () => {
    // Ayrı yuvarlayıp toplamak faturada bir kuruşluk tutarsızlık bırakır
    // ve partner komisyonu bu matrahtan hesaplandığı için hata büyür.
    for (const gross of [50_000, 90_000, 3_510_000, 9_945_000, 1, 33_333, 7]) {
      const { netKurus, vatKurus } = splitVat(gross)
      expect(netKurus + vatKurus).toBe(gross)
    }
  })

  it('KDV oranı doğru uygulanır', () => {
    const { netKurus, vatKurus } = splitVat(120_000)
    expect(netKurus).toBe(100_000)
    expect(vatKurus).toBe(20_000)
  })

  it('KDV oranı %20', () => {
    expect(VAT_RATE).toBe(0.2)
  })
})
