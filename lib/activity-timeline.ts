import type { SupabaseClient } from '@supabase/supabase-js'
import { net } from './mistakes/net'

// ÖĞRENCİ AKTİVİTE ZAMAN TÜNELİ (PRD 10.1 · Faz 2c).
//
// Yeni tablo YOK: var olan kayıtların zaman damgalarından tek kronoloji.
// YORUM ÜRETİLMEZ — yalnız "ne zaman ne oldu". Aynı gün aynı türdeki
// birim olayları (ör. 4 test teslimi) tek satırda toplanır.
// Ödemeler finans RLS'i gereği yalnız sahibe gelir (068); öğretmene boş.

export type TimelineCategory = 'akademik' | 'ders' | 'gorusme' | 'odeme' | 'not'

export const TIMELINE_CATEGORY_LABEL: Record<TimelineCategory, string> = {
  akademik: 'Akademik',
  ders: 'Dersler',
  gorusme: 'Görüşmeler',
  odeme: 'Ödemeler',
  not: 'Notlar',
}

export type TimelineKind =
  | 'homework_assigned'
  | 'homework_submitted'
  | 'homework_approved'
  | 'homework_returned'
  | 'lesson_done'
  | 'lesson_missed'
  | 'lesson_cancelled'
  | 'check_in'
  | 'intervention_opened'
  | 'intervention_closed'
  | 'payment'
  | 'note'
  // Hata defteri + soru takibi (161) — EK türler.
  | 'mistakes_added'
  | 'mistakes_learned'
  | 'questions_logged'

export const KIND_CATEGORY: Record<TimelineKind, TimelineCategory> = {
  homework_assigned: 'akademik',
  homework_submitted: 'akademik',
  homework_approved: 'akademik',
  homework_returned: 'akademik',
  lesson_done: 'ders',
  lesson_missed: 'ders',
  lesson_cancelled: 'ders',
  check_in: 'gorusme',
  intervention_opened: 'gorusme',
  intervention_closed: 'gorusme',
  payment: 'odeme',
  note: 'not',
  mistakes_added: 'akademik',
  mistakes_learned: 'akademik',
  questions_logged: 'akademik',
}

export interface TimelineEvent {
  /** Tekil anahtar (React). */
  key: string
  kind: TimelineKind
  category: TimelineCategory
  at: string
  title: string
  detail?: string | null
}

export interface TimelineSources {
  batches: { id: string; title: string | null; created_at: string; item_count?: number }[]
  items: { submitted_at: string | null; approved_at: string | null; rejected_at: string | null }[]
  sessions: { id: string; status: string; actual_at: string | null; current_planned_at: string | null; planned_at: string; note: string | null }[]
  checkIns: { id: string; submitted_at: string | null; status: string | null }[]
  interventions: { id: string; opened_at: string | null; closed_at: string | null; note: string | null }[]
  payments: { id: string; paid_on: string; amount_kurus: number; method: string | null }[]
  notes: { id: string; created_at: string; note_text: string; pinned: boolean }[]
  /** Hata defteri (161). Tablo yoksa boş; isteğe bağlı — eski çağıranlar etkilenmez. */
  mistakes?: { created_at: string | null; status: string; last_reviewed_at: string | null }[]
  questionLogs?: { log_date: string; created_at: string; correct: number; wrong: number; blank: number; penalty_divisor: number }[]
}

const day = (iso: string) => iso.slice(0, 10)
const tl = (kurus: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(kurus / 100)
const clip = (s: string | null | undefined, n = 140) => {
  const t = s?.trim()
  if (!t) return null
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

/** Birim olaylarını gün başına toplar: "4 çalışma teslim edildi". */
function grouped(
  stamps: (string | null)[],
  kind: TimelineKind,
  label: (n: number) => string
): TimelineEvent[] {
  const byDay = new Map<string, { n: number; last: string }>()
  for (const at of stamps) {
    if (!at) continue
    const d = day(at)
    const cur = byDay.get(d)
    if (!cur) byDay.set(d, { n: 1, last: at })
    else {
      cur.n++
      if (at > cur.last) cur.last = at
    }
  }
  return [...byDay].map(([d, v]) => ({
    key: `${kind}-${d}`,
    kind,
    category: KIND_CATEGORY[kind],
    at: v.last,
    title: label(v.n),
  }))
}

export function buildTimeline(src: TimelineSources): TimelineEvent[] {
  const events: TimelineEvent[] = []

  for (const b of src.batches) {
    events.push({
      key: `batch-${b.id}`,
      kind: 'homework_assigned',
      category: 'akademik',
      at: b.created_at,
      title: 'Ödev verildi',
      detail: [b.title?.trim() || null, b.item_count ? `${b.item_count} çalışma` : null].filter(Boolean).join(' · ') || null,
    })
  }
  events.push(...grouped(src.items.map(i => i.submitted_at), 'homework_submitted', n => `${n} çalışma teslim edildi`))
  events.push(...grouped(src.items.map(i => i.approved_at), 'homework_approved', n => `${n} çalışma onaylandı`))
  events.push(...grouped(src.items.map(i => i.rejected_at), 'homework_returned', n => `${n} çalışma iade edildi`))

  for (const s of src.sessions) {
    const at = s.actual_at ?? s.current_planned_at ?? s.planned_at
    const kind: TimelineKind | null =
      s.status === 'yapildi' ? 'lesson_done' : s.status === 'yapilmadi' ? 'lesson_missed' : s.status === 'iptal' ? 'lesson_cancelled' : null
    if (!kind) continue
    events.push({
      key: `session-${s.id}`,
      kind,
      category: 'ders',
      at,
      title: kind === 'lesson_done' ? 'Ders yapıldı' : kind === 'lesson_missed' ? 'Ders yapılmadı' : 'Ders iptal edildi',
      detail: clip(s.note),
    })
  }
  for (const c of src.checkIns) {
    if (!c.submitted_at) continue
    events.push({ key: `checkin-${c.id}`, kind: 'check_in', category: 'gorusme', at: c.submitted_at, title: 'Öğrenci haftalık bildirimini gönderdi' })
  }
  for (const i of src.interventions) {
    if (i.opened_at)
      events.push({ key: `int-o-${i.id}`, kind: 'intervention_opened', category: 'gorusme', at: i.opened_at, title: 'Takip başlatıldı', detail: clip(i.note) })
    if (i.closed_at)
      events.push({ key: `int-c-${i.id}`, kind: 'intervention_closed', category: 'gorusme', at: i.closed_at, title: 'Takip kapatıldı' })
  }
  for (const p of src.payments) {
    events.push({
      key: `pay-${p.id}`,
      kind: 'payment',
      category: 'odeme',
      // Ödeme GÜNÜ (saatsiz) — gün içinde sona yerleşsin.
      at: `${p.paid_on}T23:59:00`,
      title: `Ödeme alındı · ${tl(p.amount_kurus)}`,
      detail: p.method,
    })
  }
  for (const n of src.notes) {
    events.push({ key: `note-${n.id}`, kind: 'note', category: 'not', at: n.created_at, title: n.pinned ? 'Sabit not eklendi' : 'Not eklendi', detail: clip(n.note_text) })
  }

  const mistakes = src.mistakes ?? []
  events.push(...grouped(mistakes.map(m => m.created_at), 'mistakes_added', n => `${n} hata deftere eklendi`))
  events.push(
    ...grouped(
      mistakes.map(m => (m.status === 'learned' ? m.last_reviewed_at : null)),
      'mistakes_learned',
      n => `${n} hata öğrenildi`
    )
  )
  // Soru kaydı GÜN bazında: o günün toplam sorusu ve neti tek satır.
  const byDay = new Map<string, { q: number; net: number; last: string }>()
  for (const l of src.questionLogs ?? []) {
    const cur = byDay.get(l.log_date) ?? { q: 0, net: 0, last: l.created_at }
    cur.q += l.correct + l.wrong + l.blank
    cur.net += net(l.correct, l.wrong, l.penalty_divisor)
    if (l.created_at > cur.last) cur.last = l.created_at
    byDay.set(l.log_date, cur)
  }
  for (const [d, v] of byDay) {
    events.push({
      key: `questions_logged-${d}`,
      kind: 'questions_logged',
      category: 'akademik',
      at: v.last,
      title: `${v.q} soru çözüldü · net ${v.net.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`,
    })
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.key.localeCompare(b.key)))
}

/** Güne göre grupla (görüntü için), en yeni gün önce. */
export function groupByDay(events: TimelineEvent[]): { day: string; events: TimelineEvent[] }[] {
  const out: { day: string; events: TimelineEvent[] }[] = []
  for (const e of events) {
    const d = day(e.at)
    const last = out[out.length - 1]
    if (last && last.day === d) last.events.push(e)
    else out.push({ day: d, events: [e] })
  }
  return out
}

/** Son `days` gün; her kaynaktan en fazla 400 kayıt. */
export async function loadTimelineSources(
  supabase: SupabaseClient,
  { workspaceId, studentId, days = 90 }: { workspaceId: string; studentId: string; days?: number }
): Promise<TimelineSources> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const sinceDay = since.slice(0, 10)
  const [batches, items, sessions, checkIns, interventions, payments, notes, mistakes, questionLogs] = await Promise.all([
    supabase
      .from('homework_batches')
      .select('id, title, created_at, homework_items(count)')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .gte('created_at', since)
      .limit(400),
    supabase
      .from('homework_items')
      .select('submitted_at, approved_at, rejected_at, homework_batches!inner(student_id)')
      .eq('workspace_id', workspaceId)
      .eq('homework_batches.student_id', studentId)
      .or(`submitted_at.gte.${since},approved_at.gte.${since},rejected_at.gte.${since}`)
      .limit(2000),
    supabase
      .from('service_sessions')
      .select('id, status, actual_at, current_planned_at, planned_at, note')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .in('status', ['yapildi', 'yapilmadi', 'iptal'])
      .gte('planned_at', since)
      .limit(400),
    supabase
      .from('student_check_ins')
      .select('id, submitted_at, status')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .gte('submitted_at', since)
      .limit(400),
    supabase
      .from('interventions')
      .select('id, opened_at, closed_at, note')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .gte('updated_at', since)
      .limit(400),
    supabase
      .from('finance_payments')
      .select('id, paid_on, amount_kurus, method')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .gte('paid_on', sinceDay)
      .limit(400),
    supabase
      .from('academic_notes')
      .select('id, created_at, note_text, pinned')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .gte('created_at', since)
      .limit(400),
    supabase
      .from('mistakes')
      .select('created_at, status, last_reviewed_at')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .or(`created_at.gte.${since},last_reviewed_at.gte.${since}`)
      .limit(2000),
    supabase
      .from('question_logs')
      .select('log_date, created_at, correct, wrong, blank, penalty_divisor')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .gte('log_date', sinceDay)
      .limit(2000),
  ])

  const inWindow = (at: string | null) => (at && at >= since ? at : null)
  return {
    batches: ((batches.data ?? []) as { id: string; title: string | null; created_at: string; homework_items: { count: number }[] | null }[]).map(b => ({
      id: b.id,
      title: b.title,
      created_at: b.created_at,
      item_count: b.homework_items?.[0]?.count ?? undefined,
    })),
    items: ((items.data ?? []) as TimelineSources['items']).map(i => ({
      submitted_at: inWindow(i.submitted_at),
      approved_at: inWindow(i.approved_at),
      rejected_at: inWindow(i.rejected_at),
    })),
    sessions: (sessions.data ?? []) as TimelineSources['sessions'],
    checkIns: (checkIns.data ?? []) as TimelineSources['checkIns'],
    interventions: (interventions.data ?? []) as TimelineSources['interventions'],
    payments: (payments.data ?? []) as TimelineSources['payments'],
    notes: (notes.data ?? []) as TimelineSources['notes'],
    // Tablo yoksa (161 uygulanmadan) hata döner → boş liste.
    mistakes: ((mistakes.error ? [] : mistakes.data ?? []) as NonNullable<TimelineSources['mistakes']>).map(m => ({
      status: m.status,
      created_at: inWindow(m.created_at),
      last_reviewed_at: inWindow(m.last_reviewed_at),
    })),
    questionLogs: (questionLogs.error ? [] : questionLogs.data ?? []) as NonNullable<TimelineSources['questionLogs']>,
  }
}
