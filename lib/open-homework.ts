import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/fetch-all'
import { compareHomeworkItems, localDateString } from '@/lib/homework-status'
import { isoWeekKeyOfDate } from '@/lib/iso-week'
import { academicWeekNumber } from '@/lib/weekly-flow'

// AÇIK ÇALIŞMALAR — İz V2 R03 / R04.
//
// "Tüm açık çalışmalara tek yerden erişim; hangi haftadan geldikleri
// anlaşılsın." Genel Bakış'taki yayımlanan ödev listesi son 20 partiyle
// sınırlı; açık iş ondan eski bir partide kalmış olabilir. Bu yükleyici
// SINIRSIZ okur (fetchAllRows) ve her kalemi geldiği haftayla etiketler.
//
// İki ekran aynı soruyu soruyor ve aynı yanıtı almalı:
//   - Genel Bakış > Ödevler: "Açık çalışmalar" paneli (devir/çıkarma)
//   - Ödev Planlama: hafta geçişi penceresi (yeni haftaya aktarılacaklar)

export interface FlowRef {
  id: string
  startsAt: string
  dueAt: string
  status: 'active' | 'closed'
  /** "3. Hafta" — takip başlamadan önceyse null. */
  weekNo: number | null
}

export interface OpenWorkItem {
  id: string
  /** pending | pending_approval */
  status: string
  bookTitle: string | null
  trackingMode: string | null
  sectionTitle: string | null
  unitTitle: string | null
  unitNumber: number | null
  submittedAt: string | null
  batchId: string
  batchTitle: string | null
  batchDueDate: string
  batchDueAt: string | null
  /** Kalemin bağlı olduğu hafta; akış kavramından önceki ödevlerde null. */
  flowId: string | null
  /** "Gelecek haftaya devret" ile işaretlendi (152). */
  carryRequested: boolean
}

export interface OpenWork {
  items: OpenWorkItem[]
  flows: FlowRef[]
  activeFlow: FlowRef | null
}

type Nested<T> = T | T[] | null
function one<T>(value: Nested<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** Akış listesine hafta numarası ekler (en eski akış = 1. hafta çapası). */
export function labelFlows(
  rows: { id: string; starts_at: string; due_at: string; status: string }[]
): FlowRef[] {
  const sorted = [...rows].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const first = sorted[0]?.starts_at ?? null
  return sorted.map(r => ({
    id: r.id,
    startsAt: r.starts_at,
    dueAt: r.due_at,
    status: r.status === 'active' ? 'active' : 'closed',
    weekNo: first
      ? academicWeekNumber(first, isoWeekKeyOfDate(localDateString(new Date(r.starts_at))))
      : null,
  }))
}

/** Kalemin geldiği haftanın kısa adı: "3. Hafta" / "Haftasız". */
export function flowShortLabel(flow: FlowRef | null | undefined): string {
  if (!flow) return 'Haftasız'
  return flow.weekNo ? `${flow.weekNo}. Hafta` : 'Önceki dönem'
}

export async function loadOpenWork(
  supabase: SupabaseClient,
  { workspaceId, studentId }: { workspaceId: string; studentId: string }
): Promise<OpenWork> {
  const [flowsRes, itemsRes] = await Promise.all([
    supabase
      .from('weekly_flows')
      .select('id, starts_at, due_at, status')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId),
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from('homework_items')
        .select(
          `id, status, submitted_at, carry_requested_at,
           homework_batches!inner(id, title, due_date, due_at, weekly_flow_id, status, student_id, workspace_id),
           books(title, tracking_mode),
           book_sections(title, order_index),
           book_tests(title, order_index)`
        )
        .eq('workspace_id', workspaceId)
        .eq('homework_batches.student_id', studentId)
        .eq('homework_batches.status', 'active')
        .in('status', ['pending', 'pending_approval'])
        .order('id')
        .range(from, to)
    ),
  ])

  if (flowsRes.error) console.error('[open-work] haftalar okunamadı:', flowsRes.error.message)
  if (itemsRes.error) console.error('[open-work] açık çalışmalar okunamadı:', itemsRes.error.message)

  const flows = labelFlows(
    (flowsRes.data ?? []) as { id: string; starts_at: string; due_at: string; status: string }[]
  )
  const flowStart = new Map(flows.map(f => [f.id, f.startsAt]))

  type Batch = {
    id: string
    title: string | null
    due_date: string
    due_at: string | null
    weekly_flow_id: string | null
  }
  type Row = {
    id: string
    status: string
    submitted_at: string | null
    carry_requested_at: string | null
    homework_batches: Nested<Batch>
    books: Nested<{ title: string; tracking_mode: string }>
    book_sections: Nested<{ title: string; order_index: number | null }>
    book_tests: Nested<{ title: string | null; order_index: number | null }>
  }

  const rows = itemsRes.data as unknown as Row[]
  const items = rows
    .flatMap(r => {
      const batch = one(r.homework_batches)
      return batch ? [{ r, batch }] : []
    })
    .sort((a, b) => {
      // En ESKİ hafta önce; aynı partide bölüm → test sırası.
      const fa = (a.batch.weekly_flow_id && flowStart.get(a.batch.weekly_flow_id)) || a.batch.due_date
      const fb = (b.batch.weekly_flow_id && flowStart.get(b.batch.weekly_flow_id)) || b.batch.due_date
      if (fa !== fb) return fa.localeCompare(fb)
      if (a.batch.id !== b.batch.id) return a.batch.id.localeCompare(b.batch.id)
      return compareHomeworkItems(
        {
          sectionOrderIndex: one(a.r.book_sections)?.order_index ?? null,
          unitOrderIndex: one(a.r.book_tests)?.order_index ?? null,
        },
        {
          sectionOrderIndex: one(b.r.book_sections)?.order_index ?? null,
          unitOrderIndex: one(b.r.book_tests)?.order_index ?? null,
        }
      )
    })
    .map<OpenWorkItem>(({ r, batch }) => ({
      id: r.id,
      status: r.status,
      bookTitle: one(r.books)?.title ?? null,
      trackingMode: one(r.books)?.tracking_mode ?? null,
      sectionTitle: one(r.book_sections)?.title ?? null,
      unitTitle: one(r.book_tests)?.title ?? null,
      unitNumber: one(r.book_tests)?.order_index ?? null,
      submittedAt: r.submitted_at,
      batchId: batch.id,
      batchTitle: batch.title,
      batchDueDate: batch.due_date,
      batchDueAt: batch.due_at,
      flowId: batch.weekly_flow_id,
      carryRequested: r.carry_requested_at !== null,
    }))

  return {
    items,
    flows,
    activeFlow: flows.find(f => f.status === 'active') ?? null,
  }
}
