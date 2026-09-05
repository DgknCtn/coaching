// FİNANS — saf hesap ve biçimlendirme katmanı.
//
// ============================================================
// MODEL
//
//   tahakkuk (accrued)  = yapılan derslerin, ders anındaki ücretiyle toplamı
//   tahsilat (collected)= öğrenciden alınan para
//   bakiye (balance)    = tahakkuk − tahsilat
//
//   bakiye > 0 → öğrenci BORÇLU
//   bakiye < 0 → FAZLA ÖDEME (gelecek derslerden düşer)
//
// PARA KURUŞ CİNSİNDEN TAM SAYIDIR. Gerekçe 058'deki fiyatlandırmayla
// aynı: 1499.90 * 12'nin 17998.800000000001 çıktığı bir dünyada, kayan
// noktalı sayıyla tutulan bakiye er geç bir kuruş tutmaz — ve tutmayan
// bakiye, öğretmenin veliyle konuşurken güvenemeyeceği bir rakamdır.
//
// TOPLAM ALACAK ≠ NET BAKİYE. İkisi bilinçli olarak ayrı gösteriliyor:
// biri "tahsil edilecek para", diğeri "defterin net durumu". Fazla ödeme
// yapan bir öğrenci net bakiyeyi düşürür ama kimsenin borcunu azaltmaz;
// tek bir rakam göstermek, borçlu öğrenci sayısını olduğundan az
// gösterirdi.
// ============================================================

export const PAYMENT_METHODS = ['nakit', 'havale', 'kart', 'diger'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  nakit: 'Nakit',
  havale: 'Havale / EFT',
  kart: 'Kart',
  diger: 'Diğer',
}

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABEL[method] ?? method
}

/** `student_finance_view` satırı. */
export interface StudentFinanceRow {
  studentId: string
  fullName: string
  status: string
  /** Tanımlı ders ücreti (kuruş). Tanımsızsa null — 0 ile aynı şey değil. */
  perLessonKurus: number | null
  lessonCount: number
  accruedKurus: number
  collectedKurus: number
  balanceKurus: number
  lastLessonOn: string | null
  lastPaymentOn: string | null
}

export interface FinanceTotals {
  /** Tahsil edilecek para: yalnız POZİTİF bakiyelerin toplamı. */
  receivableKurus: number
  collectedKurus: number
  accruedKurus: number
  /** tahakkuk − tahsilat. Fazla ödeme bunu eksiye çekebilir. */
  netKurus: number
  debtorCount: number
  /** Ders ücreti tanımlanmamış öğrenci sayısı — sessiz veri kaybının kaynağı. */
  unpricedCount: number
}

export function financeTotals(rows: StudentFinanceRow[]): FinanceTotals {
  let receivableKurus = 0
  let collectedKurus = 0
  let accruedKurus = 0
  let debtorCount = 0
  let unpricedCount = 0

  for (const row of rows) {
    accruedKurus += row.accruedKurus
    collectedKurus += row.collectedKurus

    if (row.balanceKurus > 0) {
      receivableKurus += row.balanceKurus
      debtorCount++
    }
    if (row.perLessonKurus === null) unpricedCount++
  }

  return {
    receivableKurus,
    collectedKurus,
    accruedKurus,
    netKurus: accruedKurus - collectedKurus,
    debtorCount,
    unpricedCount,
  }
}

export type FinanceFilter = 'all' | 'debtor' | 'credit' | 'unpriced'

export const FINANCE_FILTER_LABEL: Record<FinanceFilter, string> = {
  all: 'Tümü',
  debtor: 'Borçlu',
  credit: 'Fazla ödeme',
  unpriced: 'Ücret tanımsız',
}

/**
 * Listeyi süzer.
 *
 * ARAMA TÜRKÇEYE DUYARLI: `toLocaleLowerCase('tr')` olmadan "İrem"
 * araması "irem" kaydını bulamaz — I/İ dönüşümü Türkçede farklıdır ve
 * bu, ad arayan bir ekranda sık karşılaşılan bir hata.
 */
export function filterFinanceRows(
  rows: StudentFinanceRow[],
  filter: FinanceFilter,
  query = ''
): StudentFinanceRow[] {
  const q = query.trim().toLocaleLowerCase('tr')

  return rows.filter((row) => {
    if (q && !row.fullName.toLocaleLowerCase('tr').includes(q)) return false

    switch (filter) {
      case 'debtor':
        return row.balanceKurus > 0
      case 'credit':
        return row.balanceKurus < 0
      case 'unpriced':
        return row.perLessonKurus === null
      default:
        return true
    }
  })
}

/** En çok borçlu öğrenciler — borçsuzlar hiç girmez. */
export function topDebtors(rows: StudentFinanceRow[], limit = 5): StudentFinanceRow[] {
  return rows
    .filter((r) => r.balanceKurus > 0)
    .sort((a, b) => b.balanceKurus - a.balanceKurus)
    .slice(0, limit)
}

/**
 * Kullanıcının yazdığı tutarı kuruşa çevirir.
 *
 * "1.500,50" · "1500,5" · "1500.50" · "1 500" hepsi kabul edilir:
 * kullanıcı tutarı klavyesine ve alışkanlığına göre yazar, ekranın işi
 * bunu anlamak.
 *
 * VİRGÜL DE NOKTA DA ONDALIK AYRACI SAYILIR ama binlik ayracı ATILIR.
 * Belirsizlik tek yerde: "1.500". Türkçe biçimde bu bin beş yüz, İngiliz
 * biçiminde bir buçuk. Binlik olarak okunuyor — Türkçe bir arayüzde
 * kullanıcının 1.500 yazıp 1,50 ₺ kastetme ihtimali yok denecek kadar az,
 * tersi ise sık.
 *
 * @returns kuruş, ya da geçersiz girdide null. 0 DÖNDÜRMEZ: sessizce
 * sıfıra düşen bir tutar, kullanıcının fark etmeyeceği bir kayıttır.
 */
export function parseLiraToKurus(input: string): number | null {
  const raw = input.replace(/[\s₺]/g, '')
  if (!raw) return null
  if (!/^\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?$|^\d+(?:[.,]\d{1,2})?$/.test(raw)) {
    return null
  }

  // Son ayraç, ardından 1-2 basamak geliyorsa ONDALIK; üç basamak
  // geliyorsa binlik.
  const lastSep = Math.max(raw.lastIndexOf(','), raw.lastIndexOf('.'))
  const decimals = lastSep >= 0 ? raw.length - lastSep - 1 : 0
  const isDecimal = lastSep >= 0 && decimals <= 2

  const lira = isDecimal ? raw.slice(0, lastSep) : raw
  const cents = isDecimal ? raw.slice(lastSep + 1) : ''

  const liraDigits = lira.replace(/[.,]/g, '')
  if (!/^\d+$/.test(liraDigits)) return null

  const kurus = Number(liraDigits) * 100 + Number(cents.padEnd(2, '0') || 0)
  if (!Number.isSafeInteger(kurus) || kurus < 0) return null

  return kurus
}

/** Kuruşu forma yazılabilir metne çevirir: 150050 -> "1500,50" */
export function kurusToInput(kurus: number): string {
  const lira = Math.floor(kurus / 100)
  const cents = kurus % 100
  return cents === 0 ? String(lira) : `${lira},${String(cents).padStart(2, '0')}`
}

/**
 * Bakiyenin insan dilindeki karşılığı.
 *
 * SIFIR "0,00 ₺" DEĞİL "kapalı": defterde sıfır, bir tutar değil bir
 * DURUMDUR ve öğretmenin aradığı cevap "bu öğrenciyle işim bitti mi".
 */
export function balanceState(balanceKurus: number): 'debt' | 'credit' | 'settled' {
  if (balanceKurus > 0) return 'debt'
  if (balanceKurus < 0) return 'credit'
  return 'settled'
}
