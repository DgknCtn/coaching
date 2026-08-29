// Hedef kapsamı (R4 §5).
//
// Ana karar: mevcut plan matematiği doğru çalışıyor ve DEĞİŞTİRİLMEZ.
// Değişen tek şey "planın kapsamı"dır: hedef tüm kitap olabileceği gibi
// yalnızca seçili bölümler ya da seçili test/sayfa birimleri de olabilir.
//
// Bu modül, bir kitap haritası + aktif hedeften lib/plan-pace.ts'in
// beklediği T (toplam birim) ve C (onaylı tamamlanan birim) değerlerini
// üretir. plan-pace.ts'e tek bir satır bile eklemeye gerek yoktur.

import type { BookMapBook, BookMapSection, BookMapTarget } from '@/lib/book-map'
import {
  countPages,
  formatPageRangeLabel,
  rangesFromPages,
  subtractRanges,
  type PageRange,
} from '@/lib/page-ranges'

export interface PlanScope {
  /** Kapsamdaki birim id'leri (test veya sayfa). */
  unitIds: Set<string>
  totalUnits: number
  completedUnits: number
  /** Hedefin kendi tarihleri; yoksa atamanınkiler kullanılır. */
  startDate: string | null
  targetEndDate: string | null
  scopeType: BookMapTarget['scopeType']
  /** Kapsam tüm kitap değilse kullanıcıya gösterilecek kısa açıklama. */
  label: string
  /** Kapsam içi tamamlanma yüzdesi ("Plan tamamlandı %100"). */
  percentage: number
  /**
   * Kitabın GENEL tamamlanma yüzdesi — kapsamdan bağımsız (R6-04 kabul #34).
   *
   * Kapsam %66 seçiliyken seçili kapsamın tamamı bitirildiğinde plan %100
   * olur ama kitabın kendisi hâlâ %66'dır. İki sayı ayrı gösterilmeli,
   * yoksa "bitirdim" izlenimi yanlış olur.
   */
  bookPercentage: number
  /** Kitabın tamamındaki birim sayıları — bookPercentage'ın ham hâli. */
  bookTotalUnits: number
  bookCompletedUnits: number
}

function isInScope(
  section: BookMapSection,
  testId: string,
  target: BookMapTarget | null
): boolean {
  if (!target || target.scopeType === 'whole_book') return true
  if (target.scopeType === 'sections') return target.sectionIds.includes(section.id)
  return target.unitIds.includes(testId)
}

/**
 * Kitabın aktif hedefine göre plan kapsamını hesaplar.
 *
 * Hedef yoksa kapsam tüm kitaptır ve sonuç, bugünkü davranışla birebir
 * aynıdır (totalTests / completedTests).
 */
export function resolvePlanScope(book: BookMapBook): PlanScope {
  const target = book.target
  const unitIds = new Set<string>()
  let completedUnits = 0

  for (const section of book.sections) {
    for (const test of section.tests) {
      if (!isInScope(section, test.id, target)) continue
      unitIds.add(test.id)
      if (test.state === 'completed') completedUnits++
    }
  }

  // Kitap geneli, kapsamdan bağımsız olarak ayrıca sayılır.
  let bookTotalUnits = 0
  let bookCompletedUnits = 0
  for (const section of book.sections) {
    for (const test of section.tests) {
      bookTotalUnits++
      if (test.state === 'completed') bookCompletedUnits++
    }
  }

  const totalUnits = unitIds.size

  return {
    unitIds,
    totalUnits,
    completedUnits,
    startDate: target?.startDate ?? book.startDate,
    targetEndDate: target?.targetDate ?? book.targetEndDate,
    scopeType: target?.scopeType ?? 'whole_book',
    label: scopeLabel(book, target),
    percentage: totalUnits === 0 ? 0 : Math.round((completedUnits / totalUnits) * 100),
    bookPercentage:
      bookTotalUnits === 0 ? 0 : Math.round((bookCompletedUnits / bookTotalUnits) * 100),
    bookTotalUnits,
    bookCompletedUnits,
  }
}

/**
 * Ara Hedef kapsamı (R6-04).
 *
 * Kaynak Hedefi ile AYNI matematiği kullanır; tek fark hangi hedef satırından
 * beslendiğidir. Ara hedef yoksa null döner — çağıran taraf o zaman yalnız
 * Kaynak Hedefini gösterir.
 *
 * Ara hedefin tamamlanması ana hedefin kalanını zaten azaltır (ikisi de aynı
 * completion verisini okur), bu yüzden ana tempo kendiliğinden yeniden
 * hesaplanır; ayrıca bir bağ kurmaya gerek yoktur (kabul #32).
 */
export function resolveInterimScope(book: BookMapBook): PlanScope | null {
  if (!book.interimTarget) return null
  return resolvePlanScope({ ...book, target: book.interimTarget })
}

function scopeLabel(book: BookMapBook, target: BookMapTarget | null): string {
  if (!target || target.scopeType === 'whole_book') return 'Tüm kitap'

  if (target.scopeType === 'sections') {
    const names = book.sections
      .filter((s) => target.sectionIds.includes(s.id))
      .map((s) => (book.trackingMode === 'page' ? `${s.title} ${sectionScopeLabel(s)}` : s.title))
    if (names.length === 0) return 'Seçili bölüm yok'
    if (names.length <= 2) return names.join(', ')
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} bölüm`
  }

  const count = target.unitIds.length
  return book.trackingMode === 'page' ? `${count} sayfa` : `${count} test`
}

/** "sf. 1-56" — bölümün fiziksel kapsamı. */
export function sectionScopeLabel(section: BookMapSection): string {
  if (section.pageStart == null || section.pageEnd == null) return ''
  return formatPageRangeLabel([{ start: section.pageStart, end: section.pageEnd }])
}

export interface SectionPageProgress {
  /** Bölümün kapsadığı benzersiz sayfa sayısı. */
  totalPages: number
  completedPages: number
  /** Öğretmen onayı bekleyen veya ödevde olan sayfalar. */
  inProgressPages: number
  completedRanges: PageRange[]
  inProgressRanges: PageRange[]
  /** Kapsamdan onaylıların çıkarılmasıyla türetilir (R4 §4). */
  remainingRanges: PageRange[]
  percentage: number
}

/**
 * Sayfa takipli bir bölümün ilerlemesi.
 *
 * Yüzde YALNIZCA öğretmen tarafından onaylanmış benzersiz sayfalar
 * üzerinden hesaplanır. Aynı sayfa farklı haftalarda tekrar atansa bile
 * ikinci kez sayılmaz: sayfa = tek birim satırı olduğu için bu veri
 * modelinin doğal sonucudur.
 */
export function sectionPageProgress(section: BookMapSection): SectionPageProgress {
  const scopePages = section.tests
    .map((t) => t.pageStart)
    .filter((n): n is number => n != null)

  const completed = section.tests
    .filter((t) => t.state === 'completed')
    .map((t) => t.pageStart)
    .filter((n): n is number => n != null)

  const inProgress = section.tests
    .filter((t) => t.state === 'assigned' || t.state === 'pending_approval' || t.state === 'overdue')
    .map((t) => t.pageStart)
    .filter((n): n is number => n != null)

  const scopeRanges = rangesFromPages(scopePages)
  const completedRanges = rangesFromPages(completed)
  const inProgressRanges = rangesFromPages(inProgress)

  const totalPages = countPages(scopeRanges)
  const completedPages = countPages(completedRanges)

  return {
    totalPages,
    completedPages,
    inProgressPages: countPages(inProgressRanges),
    completedRanges,
    inProgressRanges,
    remainingRanges: subtractRanges(scopeRanges, completedRanges),
    percentage: totalPages === 0 ? 0 : Math.round((completedPages / totalPages) * 100),
  }
}
