// HAFTAM V2 — GÜN EKSENLİ GÖRÜNÜM VE KART GRUPLAMASI (R8).
//
// ============================================================
// KART NEDİR, NE DEĞİLDİR
//
// Belgenin §7 veri ilkesi: *"Kart, bağımsız yeni bir akademik kayıt
// değildir. Kart yalnızca mevcut tekil test/sayfa çalışmalarının görsel
// gruplamasıdır."*
//
// Bu yüzden kart BURADA, okuma anında türetilir; veritabanında bir kart
// tablosu yoktur ve olmamalıdır. Kart bölmek yeni kayıt üretmez, eski
// kaydı silmez, çift sayım oluşturmaz — yalnız ilgili tekil kalemlerin
// `planned_for_date` değeri değişir.
//
// ============================================================
// NEDEN BU MODÜL SAF
//
// `book-structure.ts` ve `book-import.ts` ile aynı sebep: gruplama ve
// aralık etiketi mantığı doğrulanabilir olmalı. 100+ çalışmalık bir
// haftanın kaç karta indiği, hangi kartın hangi aralığı gösterdiği ve
// bölündükten sonra kalanın doğru yazıldığı teste konabilmeli (belgenin
// kabul testleri #1, #2, #3, #5).
//
// Aralık matematiğinin KENDİSİ burada yazılmaz: `lib/page-ranges.ts`
// zaten o işin tek sahibi ve orada "başka hiçbir dosya kendi aralık
// mantığını kurmamalıdır" yazıyor.

import { formatRanges, rangesFromPages, type PageRange } from './page-ranges'

export interface HaftamWork {
  id: string
  bookTitle: string
  sectionTitle: string
  testTitle: string
  /** Öğrencinin koyduğu gün (YYYY-MM-DD) — planlanmadıysa null. */
  plannedForDate: string | null
  /** Öğrenci onaya gönderdi mi (ilerlemenin ölçütü). */
  submitted: boolean
  /** Öğretmen onayladı mı — nihai "Tamamlandı". */
  approved: boolean
  /** Öğretmen iade etti mi. */
  returned: boolean
  /** Hafta ortasında eklendi mi. */
  lateAdded: boolean
  bookId: string | null
  sectionId: string | null
  /** Öğrencinin bu çalışmaya yazdığı akademik not (§12). */
  note: string | null
  /** Öğretmenin iade notu (§11). */
  teacherNote: string | null
}

export interface HaftamCard {
  /** Gruplama anahtarı; React anahtarı olarak da kullanılır. */
  key: string
  bookTitle: string
  sectionTitle: string
  /** "Test 1-4" / "sf. 35-45" — kartın kapsadığı aralığın okunur hâli. */
  unitLabel: string
  /** Kartın kapsadığı tekil çalışmalar, ekrandaki sırada. */
  works: HaftamWork[]
  /** Kartın tamamı teslim edildi mi (§9: tikli kart listenin altına iner). */
  submitted: boolean
  /** Kartın tamamı öğretmence onaylandı mı. */
  approved: boolean
  /** İçinde iade edilmiş çalışma var mı (§11). */
  hasReturned: boolean
  /** Hafta ortasında eklendi mi. */
  lateAdded: boolean
}

export interface HaftamDay {
  date: string
  weekday: number
  /** O gün teslim edilen tekil çalışma sayısı. */
  delivered: number
  /** O güne planlanmış tekil çalışma sayısı. */
  planned: number
  cards: HaftamCard[]
  dayNote: string | null
  personalItems: HaftamPersonalItem[]
}

export interface HaftamPersonalItem {
  id: string
  title: string
  done: boolean
}

/**
 * Bir çalışma satırının başlığından birim numarasını çıkarır.
 *
 * Test satırları "12. Test", sayfa satırları "sf. 34" biçiminde
 * üretiliyor (047 ve 022). Kart etiketi bu sayıdan kuruluyor; okunamayan
 * başlıkta sayı yerine ham başlık gösterilir.
 */
function unitNumber(title: string): number | null {
  const match = title.match(/(\d{1,5})/)
  return match ? Number(match[1]) : null
}

/** Satır sayfa birimi mi? ("sf. 34" / "sf.34") */
function isPageUnit(title: string): boolean {
  return /^\s*sf\.?\s*\d/i.test(title)
}

/**
 * Kartın aralık etiketi.
 *
 * Bitişik olmayan parçalar KORUNUR: "Test 1, 5-7" öğrencinin kartı
 * böldüğünde kalanın gerçekte ne olduğunu gösteren tek dürüst metin.
 * Birleştirme ve biçimleme page-ranges.ts'ten geliyor.
 */
export function cardUnitLabel(works: HaftamWork[]): string {
  const numbers = works
    .map(w => unitNumber(w.testTitle))
    .filter((n): n is number => n !== null)

  if (numbers.length === 0) {
    // Sayı okunamadıysa uydurmak yerine ham başlığı göster.
    return works[0]?.testTitle ?? ''
  }

  const ranges: PageRange[] = rangesFromPages(numbers)
  const body = formatRanges(ranges)
  const page = works.some(w => isPageUnit(w.testTitle))

  return page ? `sf. ${body}` : `Test ${body}`
}

/**
 * Aynı gün + aynı kitap + aynı bölümdeki çalışmaları tek karta toplar.
 *
 * GRUPLAMA NEDEN BU ÜÇLÜ: öğrenci ekranda "Bilgi Sarmal · Fonksiyonlar ·
 * Test 1-4" görmek istiyor (§5). Kitabı aynı ama bölümü farklı iki işi
 * birleştirmek akademik bağlamı siler; günü farklı olanları birleştirmek
 * ise kartı iki güne birden koymak olurdu.
 *
 * Giriş sırası KORUNUR: sıralama çağıran tarafta bir kez yapılıyor
 * (`compareHomeworkItems`) ve burada bozulmamalı — aynı kapsamın iki
 * ekranda iki sırada görünmesi "hangisi doğru" sorusunu doğurur.
 */
export function groupIntoCards(works: HaftamWork[]): HaftamCard[] {
  const byKey = new Map<string, HaftamWork[]>()

  for (const work of works) {
    const key = [work.plannedForDate ?? 'unplanned', work.bookId ?? '-', work.sectionId ?? '-'].join('::')
    const list = byKey.get(key)
    if (list) list.push(work)
    else byKey.set(key, [work])
  }

  const cards: HaftamCard[] = []
  for (const [key, list] of byKey) {
    cards.push({
      key,
      bookTitle: list[0].bookTitle,
      sectionTitle: list[0].sectionTitle,
      unitLabel: cardUnitLabel(list),
      works: list,
      // KARTIN DURUMU EN ZAYIF HALKADAN: bir kalem bile açıkken kart
      // "bitti" görünmemeli, yoksa öğrenci yapmadığı işi yapılmış sanır.
      submitted: list.every(w => w.submitted),
      approved: list.every(w => w.approved),
      hasReturned: list.some(w => w.returned),
      lateAdded: list.every(w => w.lateAdded),
    })
  }

  return cards
}

/**
 * §9 — TAMAMLANAN ÇALIŞMA EKRANDAN KAYBOLMAZ, ALTA İNER.
 *
 * Ayrı bir "Tamamlananlar" sekmesi gerekmiyor: gün sütunu doğal olarak
 * "üstte kalanlar, altta bugün yaptıklarım" hâline geliyor.
 *
 * Sıra İÇİNDE bozulmuyor — yalnız teslim edilenler sona alınıyor.
 */
export function sortCardsForDay(cards: HaftamCard[]): HaftamCard[] {
  const open = cards.filter(c => !c.submitted)
  const done = cards.filter(c => c.submitted)
  return [...open, ...done]
}
