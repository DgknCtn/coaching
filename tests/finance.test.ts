import { describe, it, expect } from 'vitest'
import {
  financeTotals,
  filterFinanceRows,
  topDebtors,
  parseLiraToKurus,
  kurusToInput,
  balanceState,
  type StudentFinanceRow,
  formatMinutes,
  monthPaymentLabel,
  monthPaymentState,
} from '@/lib/finance'

function row(over: Partial<StudentFinanceRow> = {}): StudentFinanceRow {
  return {
    studentId: 'a',
    fullName: 'Ali Veli',
    status: 'active',
    perLessonKurus: 50_000,
    lessonCount: 0,
    accruedKurus: 0,
    collectedKurus: 0,
    balanceKurus: 0,
    lastLessonOn: null,
    lastPaymentOn: null,
    ...over,
  }
}

describe('financeTotals', () => {
  it('alacak yalnız borçlulardan toplanır', () => {
    // Fazla ödeme yapan öğrenci net bakiyeyi düşürür ama kimsenin
    // borcunu azaltmaz. Tek rakam göstermek, tahsil edilecek parayı
    // olduğundan az gösterirdi.
    const rows = [
      row({ studentId: '1', accruedKurus: 300_000, collectedKurus: 100_000, balanceKurus: 200_000 }),
      row({ studentId: '2', accruedKurus: 100_000, collectedKurus: 150_000, balanceKurus: -50_000 }),
    ]
    const t = financeTotals(rows)

    expect(t.receivableKurus).toBe(200_000)
    expect(t.netKurus).toBe(150_000)
    expect(t.debtorCount).toBe(1)
  })

  it('tahakkuk ve tahsilat ham toplamdır', () => {
    const t = financeTotals([
      row({ accruedKurus: 120_000, collectedKurus: 80_000, balanceKurus: 40_000 }),
      row({ studentId: 'b', accruedKurus: 30_000, collectedKurus: 30_000 }),
    ])
    expect(t.accruedKurus).toBe(150_000)
    expect(t.collectedKurus).toBe(110_000)
  })

  it('ücreti tanımsız öğrenciyi sayar', () => {
    // Ücreti olmayan öğrenciye ders kaydı girilemez; bu sayı, sessizce
    // hiç tahakkuk etmeyen öğrencilerin sayısıdır.
    const t = financeTotals([row({ perLessonKurus: null }), row({ studentId: 'b' })])
    expect(t.unpricedCount).toBe(1)
  })

  it('boş listede sıfır döner, çökmez', () => {
    expect(financeTotals([])).toEqual({
      receivableKurus: 0,
      collectedKurus: 0,
      accruedKurus: 0,
      netKurus: 0,
      debtorCount: 0,
      unpricedCount: 0,
    })
  })
})

describe('filterFinanceRows', () => {
  const rows = [
    row({ studentId: '1', fullName: 'İrem Yıldız', balanceKurus: 90_000 }),
    row({ studentId: '2', fullName: 'Ahmet Kaya', balanceKurus: -20_000 }),
    row({ studentId: '3', fullName: 'Zeynep Ak', balanceKurus: 0, perLessonKurus: null }),
  ]

  it('borçlu, fazla ödeme ve ücretsizleri ayırır', () => {
    expect(filterFinanceRows(rows, 'debtor').map((r) => r.studentId)).toEqual(['1'])
    expect(filterFinanceRows(rows, 'credit').map((r) => r.studentId)).toEqual(['2'])
    expect(filterFinanceRows(rows, 'unpriced').map((r) => r.studentId)).toEqual(['3'])
    expect(filterFinanceRows(rows, 'all')).toHaveLength(3)
  })

  it('arama Türkçe I/İ dönüşümüne göre çalışır', () => {
    // 'İrem'.toLowerCase() İngilizce kurala göre 'i̇rem' üretir ve
    // 'irem' aramasıyla eşleşmez; ad arayan bir ekranda bu, kaydın
    // yokmuş gibi görünmesi demektir.
    expect(filterFinanceRows(rows, 'all', 'irem').map((r) => r.studentId)).toEqual(['1'])
    expect(filterFinanceRows(rows, 'all', 'İREM').map((r) => r.studentId)).toEqual(['1'])
  })

  it('arama ile süzgeci birlikte uygular', () => {
    expect(filterFinanceRows(rows, 'debtor', 'ahmet')).toHaveLength(0)
  })
})

describe('topDebtors', () => {
  it('borcu olmayanı listelemez ve büyükten küçüğe sıralar', () => {
    const rows = [
      row({ studentId: '1', balanceKurus: 10_000 }),
      row({ studentId: '2', balanceKurus: 90_000 }),
      row({ studentId: '3', balanceKurus: 0 }),
      row({ studentId: '4', balanceKurus: -5_000 }),
    ]
    expect(topDebtors(rows).map((r) => r.studentId)).toEqual(['2', '1'])
  })

  it('sınırı aşmaz', () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ studentId: String(i), balanceKurus: (i + 1) * 1000 })
    )
    expect(topDebtors(rows, 3)).toHaveLength(3)
  })
})

describe('parseLiraToKurus', () => {
  it('yaygın yazımların hepsini kabul eder', () => {
    expect(parseLiraToKurus('1500')).toBe(150_000)
    expect(parseLiraToKurus('1500,50')).toBe(150_050)
    expect(parseLiraToKurus('1500.50')).toBe(150_050)
    expect(parseLiraToKurus('1.500')).toBe(150_000)
    expect(parseLiraToKurus('1.500,50')).toBe(150_050)
    expect(parseLiraToKurus(' 1500 ₺ ')).toBe(150_000)
  })

  it('tek basamaklı kuruşu doğru okur', () => {
    // "1500,5" beş kuruş değil elli kuruştur; 5'i olduğu gibi almak
    // tutarı 45 kuruş eksiltirdi.
    expect(parseLiraToKurus('1500,5')).toBe(150_050)
  })

  it('geçersiz girdide null döner, sıfıra düşmez', () => {
    // Sessizce 0'a düşen bir tutar, kullanıcının fark etmeyeceği bir
    // kayıt yaratır.
    expect(parseLiraToKurus('')).toBeNull()
    expect(parseLiraToKurus('abc')).toBeNull()
    expect(parseLiraToKurus('-100')).toBeNull()
    expect(parseLiraToKurus('1500,555')).toBeNull()
  })

  it('kurusToInput ile gidiş-dönüş tutar', () => {
    for (const k of [0, 5, 50, 100, 150_050, 1_234_567]) {
      expect(parseLiraToKurus(kurusToInput(k))).toBe(k)
    }
  })
})

describe('balanceState', () => {
  it('sıfırı borç ya da alacak saymaz', () => {
    expect(balanceState(0)).toBe('settled')
    expect(balanceState(1)).toBe('debt')
    expect(balanceState(-1)).toBe('credit')
  })
})

// ============================================================
// R7-04 Rev.3 §7 no.4 ve §9 — AY BAZINDA ÖDEME DURUMU VE SÜRE
//
// NEDEN BU TESTLER VAR
//
// Görüşmeler ekranı bir AY gösteriyor. 066'nın bakiyesi ise tüm
// zamanların toplamı: Ağustos'tan devreden borç, Eylül'ün ödendiğini
// gizlerdi. İki sayının aynı rozete bakması, öğretmenin veliye yanlış
// şey söylemesi demek.
//
// Tahakkuk sıfırken rozet HİÇ ÇIKMAMALI: aylık pakete dahil ya da
// finansal takip dışı bir hizmette bu ekranda söylenecek bir şey yok.
// "Tahsil edildi" yazmak, hiç borç doğmamışken ödeme yapıldığını ima
// ederdi.
// ============================================================

describe('monthPaymentState', () => {
  it('tahakkuk yoksa durum da yok', () => {
    expect(monthPaymentState({ accruedKurus: 0, collectedKurus: 0 })).toBeNull()
    // Aylık pakete dahil bir ayda tahsilat görünse bile bu ekranın
    // gösterecek bir borcu yok.
    expect(monthPaymentState({ accruedKurus: 0, collectedKurus: 500000 })).toBeNull()
  })

  it('hiç tahsilat yoksa bekliyor', () => {
    expect(monthPaymentState({ accruedKurus: 1200000, collectedKurus: 0 })).toBe('pending')
  })

  it('tam ödemede tahsil edildi', () => {
    expect(monthPaymentState({ accruedKurus: 1200000, collectedKurus: 1200000 })).toBe('paid')
  })

  it('fazla ödeme de tahsil edildidir', () => {
    // Kalan gelecek aya devreder; BU ayın sorusu kapanmıştır.
    expect(monthPaymentState({ accruedKurus: 1200000, collectedKurus: 1500000 })).toBe('paid')
  })

  it('eksik ödemede kısmi', () => {
    expect(monthPaymentState({ accruedKurus: 1200000, collectedKurus: 400000 })).toBe('partial')
  })

  it('geçmiş aydan devreden borç bu ayın durumunu bozmuyor', () => {
    // View ayı ayırdığı için buraya yalnız o ayın sayıları gelir.
    // Testin işi, fonksiyonun kendi içinde bir toplam tutmadığını
    // sabitlemek.
    expect(monthPaymentState({ accruedKurus: 500000, collectedKurus: 500000 })).toBe('paid')
  })
})

describe('monthPaymentLabel', () => {
  it('öğretmen dili "Tahsil edildi"', () => {
    expect(monthPaymentLabel('paid')).toBe('Tahsil edildi')
  })

  it('veli dili "Ödendi" (§8)', () => {
    expect(monthPaymentLabel('paid', 'parent')).toBe('Ödendi')
  })

  it('bekleyen ödemede iki dilde de aynı', () => {
    expect(monthPaymentLabel('pending')).toBe('Bekliyor')
    expect(monthPaymentLabel('pending', 'parent')).toBe('Bekliyor')
  })

  it('durum yoksa etiket de yok', () => {
    expect(monthPaymentLabel(null)).toBeNull()
  })
})

describe('formatMinutes', () => {
  it('dokümandaki biçim: "51 saat 40 dk"', () => {
    expect(formatMinutes(3100)).toBe('51 saat 40 dk')
  })

  it('tam saatte "0 dk" eklenmiyor', () => {
    expect(formatMinutes(3600)).toBe('60 saat')
    expect(formatMinutes(60)).toBe('1 saat')
  })

  it('bir saatin altında yalnız dakika', () => {
    expect(formatMinutes(45)).toBe('45 dk')
    expect(formatMinutes(0)).toBe('0 dk')
  })

  it('negatif süre sıfıra çekiliyor', () => {
    // Bozuk veri ekranda "-3 saat" yazmasın.
    expect(formatMinutes(-90)).toBe('0 dk')
  })

  it('ondalık dakika yuvarlanıyor', () => {
    expect(formatMinutes(90.4)).toBe('1 saat 30 dk')
  })
})
