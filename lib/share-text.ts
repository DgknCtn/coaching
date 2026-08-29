// Haftalık plan paylaşım metni (R4 §7).
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

import { formatSelectedUnits } from '@/lib/book-map'

export interface ShareSection {
  title: string
  /** Test kitabında test numarası, sayfa kitabında sayfa numarası. */
  units: number[]
}

export interface ShareBook {
  bookTitle: string
  trackingMode: string
  sections: ShareSection[]
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
}

function formatDate(dueDate?: string | null): string {
  if (!dueDate) return '—'
  const date = new Date(dueDate)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('tr-TR')
}

/**
 * Tek mesajlık haftalık plan metni.
 *
 *   Merhaba Ömer,
 *
 *   Bu haftaki çalışmaların:
 *   Teslim tarihi: 30.08.2026
 *
 *   345 Matematik
 *   • Polinomlar → 3-5. Test
 *
 *   Metin 10.Sınıf Matematik
 *   • Üçgenler → sf. 1-36, 42-48
 *
 *   Zeduva 9.Sınıf Fizik
 *   • Hareket → sf. 72-91
 *   • Hareket konu anlatım videolarını izle
 *
 *   Not: Parçalı fonksiyona kadar çalış, yapamadığın soruları gruba at.
 *
 *   Çalışmalarını tamamladığında panelden durumunu işaretlemeyi unutma.
 */
export function buildShareText({
  studentName,
  dueDate,
  books,
  note,
}: ShareTextInput): string {
  const lines: string[] = [
    `Merhaba ${studentName},`,
    '',
    'Bu haftaki çalışmaların:',
    `Teslim tarihi: ${formatDate(dueDate)}`,
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

    lines.push('', book.bookTitle, ...sectionLines, ...videoLines)
  }

  // Not, ödev listesinin ARDINDAN gelir (#38): önce ne yapılacağı, sonra
  // nasıl yapılacağına dair bağlam.
  const trimmedNote = note?.trim()
  if (trimmedNote) lines.push('', `Not: ${trimmedNote}`)

  lines.push('', 'Çalışmalarını tamamladığında panelden durumunu işaretlemeyi unutma.')

  return lines.join('\n')
}
