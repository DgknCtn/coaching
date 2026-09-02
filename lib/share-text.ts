// Haftalık plan paylaşım metni (R4 §7, R7-01…04 ile güncellendi).
//
// Kural: "Ödev metnini kopyala" çıktısını üreten TEK yer burasıdır. Daha
// önce mantık homework-builder.tsx içine gömülüydü ve test edilemiyordu;
// R4'ün sıkıştırma kuralları (1,2,3,4,5. Test -> 1-5. Test) ile birlikte
// buraya, saf bir fonksiyona taşındı.
//
// WhatsApp API entegrasyonu YOKTUR ve gerekmez: clipboard yeterlidir.
// Test, sayfa ve video görevleri kitap > bölüm hiyerarşisinde gruplanıp
// tek bir mesaj üretilir. 70-100 testlik planlarda tek tek test satırı
// dökmek yerine bölüm bazlı sıkıştırılmış metin kullanılır.
//
// R7 hiyerarşisi (R7-04): mesajın İŞLEVİ değişmedi, sırası sadeleşti.
//   öğrenci -> teslim tarihi -> kitap adı + miktar -> bölüm/test/sayfa
//   -> isteğe bağlı not -> panel hatırlatması

import { formatSelectedUnits } from '@/lib/book-map'
import { APP_TIME_ZONE, todayDateString } from '@/lib/homework-status'
import { formatUnitCount } from '@/lib/unit-labels'

export interface ShareSection {
  title: string
  /** Test kitabında test numarası, sayfa kitabında sayfa numarası. */
  units: number[]
}

export interface ShareBook {
  bookTitle: string
  trackingMode: string
  sections: ShareSection[]
  /**
   * R7-02: kitap bazlı çalışma adedi — "345 Matematik (1 test)".
   *
   * Haftalık Plan panelinde ZATEN hesaplanan sayıdır; burada yeniden
   * türetilmez, çağıran taraf geçirir. Birim kaynağın takip türünden gelir
   * (lib/unit-labels.ts): test / sayfa / bölüm / adım / deneme.
   */
  unitCount?: number
  /** Bu kitap için haftalık plana eklenen video görevi (R4 §6). */
  videoTasks?: string[]
}

export interface ShareTextInput {
  studentName: string
  /** ISO tarih (YYYY-MM-DD); yoksa "—" yazılır. */
  dueDate?: string | null
  books: ShareBook[]
  /**
   * Ödev notu (R6-05) — isteğe bağlı insan bağlamı.
   *
   * Boşsa çıktıya HİÇBİR ŞEY eklenmez: başlık da satır da yok. R6-05'in
   * kabul testi #36 bunu ölçüyor ("not boşken mevcut çıktı değişmemeli").
   * Ödev başına TEK nottur; test veya sayfa kaynağı sayısı fark etmez,
   * mesajda bir kez görünür (#39).
   */
  note?: string | null
  /** Testlerde "bugün"ü sabitlemek için; verilmezse gerçek bugün. */
  today?: string
}

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  weekday: 'long',
})

/** İki YYYY-MM-DD günü arasındaki tam gün farkı. */
function dayDiff(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86_400_000)
}

/**
 * Teslim tarihi metni (R7-01).
 *
 *   31 Ağustos 2026 Pazartesi (7 gün sonra)
 *   3 Eylül 2026 Perşembe (Bugün)
 *   4 Eylül 2026 Cuma (Yarın)
 *
 * Amaç, öğrenci ve velinin yalnız bir tarihi değil teslime KALAN SÜREYİ de
 * tek bakışta algılaması. Gün farkı dinamiktir.
 *
 * Gün hesabı yeni bir tarih mantığı KURMAZ: R6-02'nin yerel gün semantiğini
 * (lib/homework-status.ts, migration 027) yeniden kullanır. `new Date(x) <
 * new Date()` karşılaştırması burada da yasaktır — UTC gece yarısına
 * ayrışıp gün kaydırır.
 */
export function formatDueDate(dueDate?: string | null, today?: string): string {
  if (!dueDate) return '—'
  const parsed = Date.parse(`${dueDate}T12:00:00Z`)
  if (Number.isNaN(parsed)) return '—'

  // "31 Ağustos 2026 Pazartesi" — tr-TR varsayılanı günü sona koyar.
  const parts = dateFormatter.formatToParts(new Date(parsed))
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const natural = `${get('day')} ${get('month')} ${get('year')} ${get('weekday')}`

  const diff = dayDiff(today ?? todayDateString(), dueDate)
  if (diff === null) return natural
  if (diff === 0) return `${natural} (Bugün)`
  if (diff === 1) return `${natural} (Yarın)`
  if (diff > 1) return `${natural} (${diff} gün sonra)`
  // Geçmiş bir tarih normalde seçilemez; yine de sessizce yanlış bilgi
  // vermek yerine durumu açıkça yazarız.
  return `${natural} (${Math.abs(diff)} gün geçti)`
}

/**
 * Tek mesajlık haftalık plan metni.
 *
 *   Merhaba Ömer,
 *
 *   Bu haftaki çalışmaların:
 *   Teslim tarihi: 31 Ağustos 2026 Pazartesi (7 gün sonra)
 *
 *   345 Matematik (1 test)
 *   • 5. Bölüm - Trigonometri 1 → 4. Test
 *
 *   TED Math 9 - Book 2 (10 sayfa)
 *   • 4.1 Geometric Transformations → sf. 1-10
 *
 *   Not: Tekrarlarımızı unutmayalım.
 *
 *   Çalışmalarını tamamladığında panelden durumunu işaretlemeyi unutma.
 */
export function buildShareText({
  studentName,
  dueDate,
  books,
  note,
  today,
}: ShareTextInput): string {
  const lines: string[] = [
    `Merhaba ${studentName},`,
    '',
    'Bu haftaki çalışmaların:',
    `Teslim tarihi: ${formatDueDate(dueDate, today)}`,
  ]

  for (const book of books) {
    const sectionLines = book.sections
      .map((section) => {
        const units = formatSelectedUnits(section.units, book.trackingMode)
        return units ? `• ${section.title} → ${units}` : null
      })
      .filter((line): line is string => line !== null)

    const videoLines = (book.videoTasks ?? []).map((task) => `• ${task}`)

    // Ne test/sayfa ne video varsa kitap başlığını hiç yazma.
    if (sectionLines.length === 0 && videoLines.length === 0) continue

    // R7-02: kitap başlığı miktarını da taşır. Adet verilmemişse (ör. yalnız
    // video görevi olan kitap) başlık eskisi gibi sade kalır.
    const heading =
      book.unitCount && book.unitCount > 0
        ? `${book.bookTitle} (${formatUnitCount(book.unitCount, book.trackingMode)})`
        : book.bookTitle

    lines.push('', heading, ...sectionLines, ...videoLines)
  }

  // Not, ödev listesinin ARDINDAN gelir (#38): önce ne yapılacağı, sonra
  // nasıl yapılacağına dair bağlam.
  const trimmedNote = note?.trim()
  if (trimmedNote) lines.push('', `Not: ${trimmedNote}`)

  lines.push('', 'Çalışmalarını tamamladığında panelden durumunu işaretlemeyi unutma.')

  return lines.join('\n')
}
