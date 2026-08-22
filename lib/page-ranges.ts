// Sayfa aralığı matematiği (R4 §4).
//
// Kural: Sayfa aralıklarının birleşimi, farkı ve okunur biçimi bu modülde
// hesaplanır — başka hiçbir dosya kendi aralık mantığını kurmamalıdır.
// Fonksiyonların tamamı saftır ve UI'dan bağımsızdır; raporlama ve
// WhatsApp metni de aynı yerden beslenir.
//
// Model notu: sayfa takipli kitapta her fiziksel sayfa tek bir birim
// (book_tests satırı) olarak tutulur. Bu yüzden "aynı sayfa iki kez
// sayılmasın" kuralı veri katmanında zaten garanti altındadır; buradaki
// fonksiyonlar sayfa NUMARALARINI okunur aralıklara çevirmek ve kalan
// aralıkları türetmek içindir.

/** Kapalı aralık: [start, end], her iki uç da dahil. */
export interface PageRange {
  start: number
  end: number
}

function isValid(range: PageRange): boolean {
  return (
    Number.isInteger(range.start) &&
    Number.isInteger(range.end) &&
    range.start >= 1 &&
    range.end >= range.start
  )
}

/**
 * Çakışan ve BİTİŞİK aralıkları tek aralığa indirger.
 *
 *   [1-36, 42-48]        -> [1-36, 42-48]   (arada boşluk var, ayrı kalır)
 *   [1-10, 11-20]        -> [1-20]          (bitişik, birleşir)
 *   [1-20, 5-8]          -> [1-20]          (içerilen, yutulur)
 *
 * Geçersiz aralıklar sessizce elenir: girdi kullanıcıdan gelebilir.
 */
export function unionRanges(ranges: PageRange[]): PageRange[] {
  const sorted = ranges.filter(isValid).sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: PageRange[] = []

  for (const range of sorted) {
    const last = merged[merged.length - 1]
    // +1: 1-10 ile 11-20 arasında boşluk yok, tek aralıktır.
    if (last && range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end)
      continue
    }
    merged.push({ start: range.start, end: range.end })
  }

  return merged
}

/**
 * `base` aralıklarından `subtract` aralıklarını çıkarır.
 *
 *   1-56  eksi  [1-36, 42-48]  ->  [37-41, 49-56]
 *
 * Kalan aralıkların otomatik türetilmesi bunun üzerinden yapılır: bir
 * bölümün son sayfaları bilinçli olarak verilmemişse "kalan" olarak
 * görünmeye devam eder — bu bir hata değildir (R4 §4).
 */
export function subtractRanges(base: PageRange[], subtract: PageRange[]): PageRange[] {
  const holes = unionRanges(subtract)
  const result: PageRange[] = []

  for (const range of unionRanges(base)) {
    let cursor = range.start

    for (const hole of holes) {
      if (hole.end < cursor) continue
      if (hole.start > range.end) break
      if (hole.start > cursor) result.push({ start: cursor, end: hole.start - 1 })
      cursor = Math.max(cursor, hole.end + 1)
      if (cursor > range.end) break
    }

    if (cursor <= range.end) result.push({ start: cursor, end: range.end })
  }

  return result
}

/** Aralıkların kapsadığı benzersiz sayfa sayısı. */
export function countPages(ranges: PageRange[]): number {
  return unionRanges(ranges).reduce((sum, r) => sum + (r.end - r.start + 1), 0)
}

/**
 * Sayfa numaralarını aralıklara toplar.
 *
 *   [1,2,3, 7,8]  ->  [1-3, 7-8]
 */
export function rangesFromPages(pages: number[]): PageRange[] {
  return unionRanges(
    [...new Set(pages)]
      .filter((n) => Number.isInteger(n) && n >= 1)
      .map((n) => ({ start: n, end: n }))
  )
}

/** Aralıkların kapsadığı sayfa numaraları (küçükten büyüğe). */
export function pagesFromRanges(ranges: PageRange[]): number[] {
  const pages: number[] = []
  for (const range of unionRanges(ranges)) {
    for (let n = range.start; n <= range.end; n++) pages.push(n)
  }
  return pages
}

/**
 * Okunur tek satır: `1-36, 42-48`. Tek sayfalık aralık `37` biçiminde yazılır.
 * Boş listede boş metin döner — çağıran yerin "-" gibi bir yer tutucu koyması
 * kendi kararıdır.
 */
export function formatRanges(ranges: PageRange[]): string {
  return unionRanges(ranges)
    .map((r) => (r.start === r.end ? `${r.start}` : `${r.start}-${r.end}`))
    .join(', ')
}

/** `sf. 1-36, 42-48` — ödev metni ve bölüm satırı için ortak etiket. */
export function formatPageRangeLabel(ranges: PageRange[]): string {
  const body = formatRanges(ranges)
  return body ? `sf. ${body}` : ''
}

/**
 * Kullanıcının yazdığı serbest metni aralıklara çevirir.
 *
 *   "1-36, 42-48"   -> [1-36, 42-48]
 *   "sf. 1-36; 42"  -> [1-36, 42-42]
 *
 * Ayrıştırılamayan parçalar `invalid` içinde döner ki form kullanıcıya
 * sessizce yanlış aralık kaydetmek yerine ne anlamadığını söyleyebilsin.
 */
export function parseRanges(input: string): { ranges: PageRange[]; invalid: string[] } {
  const ranges: PageRange[] = []
  const invalid: string[] = []

  const cleaned = input.replace(/sf\.?/gi, ' ').replace(/sayfa/gi, ' ')

  for (const rawPart of cleaned.split(/[,;]/)) {
    const part = rawPart.trim()
    if (!part) continue

    const single = part.match(/^(\d+)$/)
    if (single) {
      ranges.push({ start: Number(single[1]), end: Number(single[1]) })
      continue
    }

    const span = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/)
    if (span) {
      const start = Number(span[1])
      const end = Number(span[2])
      if (end >= start) {
        ranges.push({ start, end })
        continue
      }
    }

    invalid.push(part)
  }

  return { ranges: unionRanges(ranges), invalid }
}

/** Bir aralık kümesini bölüm kapsamıyla kesiştirir (kapsam dışına taşmayı önler). */
export function clampToScope(ranges: PageRange[], scope: PageRange): PageRange[] {
  return unionRanges(
    ranges
      .filter(isValid)
      .map((r) => ({ start: Math.max(r.start, scope.start), end: Math.min(r.end, scope.end) }))
      .filter((r) => r.end >= r.start)
  )
}
