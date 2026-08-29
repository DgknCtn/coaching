// Görevler ekranı bilgi hiyerarşisi (R6-09).
//
// Sorun: düz listede aynı öğrencinin farklı ödev/kitap/bölüm satırları
// karışık görünüyor. İki farklı ödevde aynı kitap kullanıldığında hangi
// satırın hangi ödeve ait olduğu anlaşılmıyor.
//
// Çözüm VERİ YAPISINI DEĞİŞTİRMEK DEĞİL, sorgu sonucunu görüntüleme
// katmanında gruplamaktır: Öğrenci > Ödev > Kaynak/Bölüm > Çalışma.
// Sorgular ve RPC'ler aynen kalır.
//
// Bu modül saf: girdi satır listesi, çıktı iç içe grup listesi. Sıra
// korunur — sunucu zaten anlamlı bir sırada gönderiyor (onay kuyruğunda
// en eski gönderim önce, gecikmede en eski teslim önce).

export interface TaskRowLike {
  id: string
  studentId: string
  studentName: string
  batchId: string
  batchTitle: string | null
  dueDate: string | null
  bookId: string | null
  bookTitle: string
  trackingMode: string
}

export interface TaskBookGroup<T> {
  key: string
  batchId: string
  bookId: string | null
  batchTitle: string | null
  dueDate: string | null
  bookTitle: string
  trackingMode: string
  rows: T[]
}

export interface TaskStudentGroup<T> {
  studentId: string
  studentName: string
  /** Bu öğrencinin tüm gruplarındaki toplam satır sayısı. */
  count: number
  books: TaskBookGroup<T>[]
}

/**
 * Satırları Öğrenci > (Ödev + Kaynak) hiyerarşisine çevirir.
 *
 * Gruplama anahtarı ödev VE kitap birlikte: aynı kitap iki farklı ödevde
 * kullanıldığında iki ayrı grup olur (kabul #55). Yalnız kitaba göre
 * gruplamak tam da dokümanın şikâyet ettiği karışıklığı sürdürürdü.
 */
export function groupTasksByStudent<T extends TaskRowLike>(rows: T[]): TaskStudentGroup<T>[] {
  const students = new Map<string, TaskStudentGroup<T>>()

  for (const row of rows) {
    const student = students.get(row.studentId) ?? {
      studentId: row.studentId,
      studentName: row.studentName,
      count: 0,
      books: [],
    }

    const bookKey = `${row.batchId}:${row.bookId ?? '-'}`
    let book = student.books.find(b => b.key === bookKey)
    if (!book) {
      book = {
        key: bookKey,
        batchId: row.batchId,
        bookId: row.bookId,
        batchTitle: row.batchTitle,
        dueDate: row.dueDate,
        bookTitle: row.bookTitle,
        trackingMode: row.trackingMode,
        rows: [],
      }
      student.books.push(book)
    }

    book.rows.push(row)
    student.count++
    students.set(row.studentId, student)
  }

  return [...students.values()]
}

/**
 * Grup başlığı: ödev + kitap kimliğini anlamlı biçimde birleştirir.
 *
 *   "Haftalık Plan - 12. Hafta · MÖF Matematik"
 *   "30.08.2026 · 345 Matematik"   (ödevin başlığı yoksa teslim tarihi)
 */
export function taskGroupLabel(group: {
  batchTitle: string | null
  dueDate: string | null
  bookTitle: string
}): string {
  const left = group.batchTitle?.trim()
    ? group.batchTitle.trim()
    : group.dueDate
      ? new Date(group.dueDate).toLocaleDateString('tr-TR')
      : 'Ödev'
  return `${left} · ${group.bookTitle}`
}
