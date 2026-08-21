// Kitap Haritası veri yükleyicisi (R3 v2 §A).
//
// Kural: Bir öğrencinin kitaplarındaki test durumlarını okuyan TEK yer burasıdır.
// Öğrenci-kitap sayfası ve Ödev Ver/Harita ekranı aynı yükleyiciyi kullanır;
// ikinci bir "harita durumu" veri seti oluşturulmaz (R3 v2 §5). Durum türetmesi
// lib/homework-status.ts'e delege edilir — renkler yalnız o durumların görsel
// karşılığıdır.

import { deriveTestState, type HomeworkTestState } from '@/lib/homework-status'

export interface BookMapTest {
  id: string
  title: string
  orderIndex: number
  state: HomeworkTestState
  /** Açık ödev kaydı varsa id'si — tekil onay/red işlemleri için. */
  homeworkItemId: string | null
}

export interface BookMapSection {
  id: string
  title: string
  orderIndex: number
  tests: BookMapTest[]
  completedCount: number
}

export interface BookMapBook {
  assignmentId: string
  bookId: string
  title: string
  subject: string | null
  examType: string | null
  publisher: string | null
  trackingMode: string
  startDate: string | null
  targetEndDate: string | null
  sections: BookMapSection[]
  totalTests: number
  completedTests: number
  /** Bir bölümdeki en yüksek test sayısı — matrisin sütun genişliği. */
  maxTestsPerSection: number
}

interface LoadBookMapArgs {
  workspaceId: string
  studentId: string
  /** Verilirse yalnız bu kitaplar yüklenir; verilmezse tüm aktif atamalar. */
  bookIds?: string[]
  /** Test edilebilirlik için enjekte edilebilir. */
  today?: Date
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type SupabaseLike = any

/**
 * Öğrencinin aktif kitap atamalarını, bölüm/test ağacıyla ve her testin tek
 * aktif durumuyla birlikte döner.
 *
 * `homework_batches.due_date` bilinçli olarak join edilir: teslim tarihi
 * olmadan "süresi geçen" durumu türetilemez (eski tek-kitap sayfası bu yüzden
 * overdue'yu hiç gösteremiyordu).
 */
export async function loadBookMap(
  supabase: SupabaseLike,
  { workspaceId, studentId, bookIds, today }: LoadBookMapArgs
): Promise<BookMapBook[]> {
  let assignmentQuery = supabase
    .from('student_book_assignments')
    .select(`
      id, book_id, start_date, target_end_date,
      books(
        id, title, subject, exam_type, publisher, tracking_mode,
        book_sections(
          id, title, order_index, status,
          book_tests(id, title, order_index, status)
        )
      )
    `)
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')

  if (bookIds?.length) {
    assignmentQuery = assignmentQuery.in('book_id', bookIds)
  }

  const { data: assignments } = await assignmentQuery
  const rows = (assignments ?? []) as any[]
  if (rows.length === 0) return []

  const assignmentIds = rows.map((a) => a.id)

  // Açık ödev kayıtları + ait oldukları batch'in teslim tarihi.
  const { data: openItems } = await supabase
    .from('homework_items')
    .select(
      'id, book_test_id, status, rejected_at, homework_batches!inner(due_date, status)'
    )
    .in('student_book_assignment_id', assignmentIds)
    .in('status', ['pending', 'pending_approval'])
    .eq('homework_batches.status', 'active')

  // Onaylanmış ilerleme (resmi kayıt).
  const { data: completions } = await supabase
    .from('test_completions')
    .select('book_test_id')
    .in('student_book_assignment_id', assignmentIds)
    .eq('status', 'active')

  const completedIds = new Set<string>(
    ((completions ?? []) as any[]).map((c) => c.book_test_id)
  )

  const itemByTestId = new Map<string, any>()
  for (const item of (openItems ?? []) as any[]) {
    // Aynı test için birden fazla açık kayıt normalde RPC tarafından
    // engelleniyor; yine de deterministik olmak için ilkini koruyoruz.
    if (!itemByTestId.has(item.book_test_id)) itemByTestId.set(item.book_test_id, item)
  }

  return rows.map((assignment) => {
    const book = assignment.books
    const sections: BookMapSection[] = (book?.book_sections ?? [])
      .filter((s: any) => s.status === 'active')
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((s: any) => {
        const tests: BookMapTest[] = (s.book_tests ?? [])
          .filter((t: any) => t.status === 'active')
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((t: any) => {
            const item = itemByTestId.get(t.id)
            return {
              id: t.id,
              title: t.title,
              orderIndex: t.order_index,
              homeworkItemId: item?.id ?? null,
              state: deriveTestState({
                hasActiveCompletion: completedIds.has(t.id),
                itemStatus: item?.status ?? null,
                dueDate: item?.homework_batches?.due_date ?? null,
                rejectedAt: item?.rejected_at ?? null,
                today,
              }),
            }
          })
        return {
          id: s.id,
          title: s.title,
          orderIndex: s.order_index,
          tests,
          completedCount: tests.filter((t) => t.state === 'completed').length,
        }
      })
      .filter((s: BookMapSection) => s.tests.length > 0)

    const totalTests = sections.reduce((sum, s) => sum + s.tests.length, 0)

    return {
      assignmentId: assignment.id,
      bookId: assignment.book_id,
      title: book?.title ?? '',
      subject: book?.subject ?? null,
      examType: book?.exam_type ?? null,
      publisher: book?.publisher ?? null,
      trackingMode: book?.tracking_mode ?? 'test',
      startDate: assignment.start_date ?? null,
      targetEndDate: assignment.target_end_date ?? null,
      sections,
      totalTests,
      completedTests: sections.reduce((sum, s) => sum + s.completedCount, 0),
      maxTestsPerSection: sections.reduce((max, s) => Math.max(max, s.tests.length), 0),
    }
  })
}

/** Haritada seçilebilir durumlar. Tamamlanmış veya halihazırda ödevde olan
 *  bir test yeniden atanamaz — create_homework_batch bunu zaten reddeder. */
export function isSelectableState(state: HomeworkTestState): boolean {
  return state === 'not_assigned'
}

/**
 * Haftalık plan panelinde bir bölümden seçilen testleri okunur tek satıra çevirir.
 *
 *   [1,2,3]   -> "1, 2, 3. Test"
 *   [5,7,9]   -> "5, 7, 9. Test"
 *   [4,5,6] + tracking_mode='page' -> "4-6. Sayfa Aralığı"
 *
 * Sayfa takipli kitapta birim "test" değil sayfa aralığıdır (013_book_tracking_mode);
 * ardışık seçimler tek aralık olarak kısaltılır, çünkü zaten aralık ifade ederler.
 */
export function formatSelectedUnits(
  orderIndexes: number[],
  trackingMode: string
): string {
  const sorted = [...orderIndexes].sort((a, b) => a - b)
  if (sorted.length === 0) return ''

  const unitLabel = trackingMode === 'page' ? 'Sayfa Aralığı' : 'Test'

  // Sayfa modunda ardışık blokları "4-6" biçiminde topla.
  if (trackingMode === 'page') {
    const parts: string[] = []
    let start = sorted[0]
    let prev = sorted[0]
    for (const n of sorted.slice(1)) {
      if (n === prev + 1) {
        prev = n
        continue
      }
      parts.push(start === prev ? `${start}` : `${start}-${prev}`)
      start = n
      prev = n
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`)
    return `${parts.join(', ')}. ${unitLabel}`
  }

  return `${sorted.join(', ')}. ${unitLabel}`
}
