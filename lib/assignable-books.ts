import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssignableBook } from '@/app/(dashboard)/teacher/students/[studentId]/assign-book-dialog'

// "Bu öğrenciye hangi kitaplar atanabilir?" sorusunun TEK yanıtı.
//
// Sorgu önce yalnız öğrenci genel bakış sayfasındaydı. Kaynak Planı ekranına
// da "Kaynak Ekle" gelince aynı sorgunun ikinci bir kopyası çıkacaktı; iki
// kopya zamanla ayrışır (R6-15 ile eklenen metadata alanları buna örnek:
// biri güncellenir, diğeri unutulur) ve iki ekran farklı kitap listesi
// gösterirdi.
//
// İKİ SÜZGEÇ:
//   - Aktif dönem yoksa sorgu HİÇ yapılmaz ve liste boştur. Kitap havuzu
//     döneme bağlıdır; dönemsiz atama kaydı sahipsiz kalırdı.
//   - Zaten atanmış kitaplar listeden düşer: aynı kitabı ikinci kez atamak
//     ilerlemeyi ikiye böler.
//   - ARŞİVLENMİŞ atamalar da düşer (M1.0-01 §1.2): yeniden atama
//     (student_id, book_id, term) tekilliğine takılırdı. Doğru yol
//     Kaynak Planındaki arşivden "Geri al"dır. `studentId` verilirse
//     öğrencinin TÜM atamaları durumdan bağımsız elenir.
export async function loadAssignableBooks(
  supabase: SupabaseClient,
  {
    workspaceId,
    termId,
    assignedBookIds,
    studentId,
  }: {
    workspaceId: string
    termId: string | null
    assignedBookIds: string[]
    studentId?: string
  }
): Promise<AssignableBook[]> {
  if (!termId) return []

  const [{ data }, archivedRes] = await Promise.all([
    supabase
      .from('books')
      // R6-15: arama ve filtre için ek metadata.
      .select('id, title, subject, publisher, level_exam, edition_year, curriculum_program')
      .eq('workspace_id', workspaceId)
      .eq('academic_term_id', termId)
      .eq('status', 'active'),
    studentId
      ? supabase
          .from('student_book_assignments')
          .select('book_id')
          .eq('workspace_id', workspaceId)
          .eq('student_id', studentId)
          .eq('academic_term_id', termId)
      : Promise.resolve({ data: [] as { book_id: string }[] }),
  ])

  const assigned = new Set([
    ...assignedBookIds,
    ...((archivedRes.data ?? []) as { book_id: string }[]).map(r => r.book_id),
  ])
  return ((data ?? []) as AssignableBook[]).filter(b => !assigned.has(b.id))
}
