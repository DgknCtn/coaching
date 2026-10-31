import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetch-all'
import { localDateString } from '@/lib/homework-status'
import { summarizeLoad } from '@/lib/homework-load'
import { loadStudentTasks } from '@/lib/academic-tasks-load'
import { buildShareText, groupPublishedUnits, type PublishedShareUnit } from '@/lib/share-text'

// GÜNCEL ÖDEV MESAJI — İz V2 R04.
//
// "Yayımlanan haftalık listenin yanında 'Mesaj metnini kopyala' erişimi
// olsun. İlk yayın ve aynı hafta sonradan eklenen yayımlanmış çalışmalar
// güncel metinde birer kez yer alsın. Taslaklar ve aktif yükten
// çıkarılan işler mesaja girmesin."
//
// Kaynak AKTİF HAFTANIN kayıtlarıdır; Ödev Planlama sepeti değil:
//   - kitap kalemleri: aktif haftaya bağlı, aktif partilerin iptal
//     edilmemiş kalemleri (aktif yükten çıkarılan / devredilen girmez)
//   - akademik görevler: aktif haftanın öğretmen görevleri, taslak ve
//     kapatılan hariç
// Metin mevcut düzenle (buildShareText) üretilir; ders bazlı gruplama
// yoktur. Kopyalamak hiçbir kayıt oluşturmaz.

type Nested<T> = T | T[] | null
function one<T>(value: Nested<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export async function loadWeekMessage(
  supabase: SupabaseClient,
  {
    workspaceId,
    studentId,
    studentName,
    flow,
    now = new Date(),
  }: {
    workspaceId: string
    studentId: string
    studentName: string
    flow: { id: string; dueAt: string } | null
    now?: Date
  }
): Promise<string | null> {
  if (!flow) return null

  const [itemsRes, tasks] = await Promise.all([
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from('homework_items')
        .select(
          `id, book_id, section_id,
           homework_batches!inner(weekly_flow_id, status, description, created_at),
           books(title, tracking_mode),
           book_sections(title),
           book_tests(order_index)`
        )
        .eq('workspace_id', workspaceId)
        .eq('homework_batches.weekly_flow_id', flow.id)
        .eq('homework_batches.status', 'active')
        .neq('status', 'cancelled')
        .order('id')
        .range(from, to)
    ),
    loadStudentTasks(supabase, { studentId, statuses: ['open', 'done'] }).catch(error => {
      console.error('[week-message] görevler okunamadı:', error)
      return []
    }),
  ])
  if (itemsRes.error) {
    console.error('[week-message] kalemler okunamadı:', itemsRes.error.message)
    return null
  }

  type Row = {
    book_id: string
    section_id: string
    homework_batches: Nested<{ description: string | null; created_at: string }>
    books: Nested<{ title: string; tracking_mode: string }>
    book_sections: Nested<{ title: string }>
    book_tests: Nested<{ order_index: number | null }>
  }
  const rows = itemsRes.data as unknown as Row[]

  const units: PublishedShareUnit[] = []
  for (const r of rows) {
    const order = one(r.book_tests)?.order_index
    if (order == null) continue
    units.push({
      bookId: r.book_id,
      bookTitle: one(r.books)?.title ?? 'Kitap',
      trackingMode: one(r.books)?.tracking_mode ?? 'test',
      sectionId: r.section_id,
      sectionTitle: one(r.book_sections)?.title ?? 'Bölüm',
      unitNumber: order,
    })
  }

  const weekTasks = tasks.filter(
    t => t.weeklyFlowId === flow.id && t.createdByRole === 'teacher'
  )
  if (units.length === 0 && weekTasks.length === 0) return null

  // Partilerin notları (yayın sırasıyla), her biri bir kez.
  const notes = [
    ...new Set(
      rows
        .map(r => one(r.homework_batches))
        .filter((b): b is { description: string | null; created_at: string } => !!b)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(b => b.description?.trim() ?? '')
        .filter(Boolean)
    ),
  ]

  const books = groupPublishedUnits(units)
  const dueDate = localDateString(new Date(flow.dueAt))
  return buildShareText({
    studentName,
    dueDate,
    dueAt: flow.dueAt,
    load: summarizeLoad(
      books.flatMap(b => b.sections.flatMap(s => s.units.map(() => ({ trackingMode: b.trackingMode })))),
      dueDate,
      now
    ),
    books,
    tasks: weekTasks.map(t => ({
      scopeName: t.scopeName,
      title: t.title,
      kind: t.kind,
      targetMinutes: t.targetMinutes,
      checklist: t.checklist.map(i => i.title),
    })),
    note: notes.join('\n') || undefined,
  })
}
