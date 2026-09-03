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
export async function loadAssignableBooks(
  supabase: SupabaseClient,
  {
    workspaceId,
    termId,
    assignedBookIds,
  }: { workspaceId: string; termId: string | null; assignedBookIds: string[] }
): Promise<AssignableBook[]> {
  if (!termId) return []

  const { data } = await supabase
    .from('books')
    // R6-15: arama ve filtre için ek metadata.
    .select('id, title, subject, publisher, level_exam, edition_year, curriculum_program')
    .eq('workspace_id', workspaceId)
    .eq('academic_term_id', termId)
    .eq('status', 'active')

  const assigned = new Set(assignedBookIds)
  return ((data ?? []) as AssignableBook[]).filter(b => !assigned.has(b.id))
}
