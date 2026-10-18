// AKADEMİK GÖREVLER — M1.0-03 (migration 148).
//
// Kitap, öğrencinin çalışma araçlarından yalnız biridir; ders akademik
// operasyonun konteyneridir. Kitap dışı iş üç türle taşınır:
//
//   gorev      "AYT Geometri — Tüm formülleri çıkar"     öğrenci tikler
//   checklist  "Kimya yazılısı — Redox / Asit-Baz"        alt maddeler
//   sure       "11. Sınıf Fizik — Bu hafta 120 dk"        85/120 dk
//
// Tamamlandı tiki öğrencinin BEYANIDIR; öğretmen onayı yoktur (§3). Asıl
// kontrol haftalık akademik takip görüşmesinde yapılır.
//
// SAF modül: veritabanı satırından ekran modeline, hızlı girişten türe.

export type AcademicTaskKind = 'gorev' | 'checklist' | 'sure'
export type AcademicTaskStatus = 'draft' | 'open' | 'done' | 'closed'

export const TASK_KIND_LABEL: Record<AcademicTaskKind, string> = {
  gorev: 'Görev',
  checklist: 'Checklist',
  sure: 'Süre hedefi',
}

export interface ChecklistItem {
  id: string
  title: string
  done: boolean
}

export interface AcademicTask {
  id: string
  studentId: string
  scopeId: string
  scopeName: string
  kind: AcademicTaskKind
  title: string
  targetMinutes: number | null
  doneMinutes: number
  createdByRole: 'teacher' | 'student'
  tracked: boolean
  status: AcademicTaskStatus
  dueAt: string | null
  undated: boolean
  weeklyFlowId: string | null
  originFlowId: string | null
  plannedForDate: string | null
  completedAt: string | null
  checklist: ChecklistItem[]
}

export const TASK_SELECT =
  'id, student_id, scope_id, kind, title, target_minutes, done_minutes, created_by_role, tracked, status, due_at, undated, weekly_flow_id, origin_flow_id, planned_for_date, completed_at'

export const CHECKLIST_SELECT = 'id, task_id, title, done, order_index'

type Row = Record<string, unknown>

export function mapTasks(
  rows: Row[],
  checklistRows: Row[],
  scopeNames: Map<string, string>
): AcademicTask[] {
  const items = new Map<string, (ChecklistItem & { order: number })[]>()
  for (const r of checklistRows) {
    const list = items.get(r.task_id as string) ?? []
    list.push({
      id: r.id as string,
      title: r.title as string,
      done: Boolean(r.done),
      order: Number(r.order_index ?? 0),
    })
    items.set(r.task_id as string, list)
  }
  return rows.map((r) => ({
    id: r.id as string,
    studentId: r.student_id as string,
    scopeId: r.scope_id as string,
    scopeName: scopeNames.get(r.scope_id as string) ?? 'Ders',
    kind: r.kind as AcademicTaskKind,
    title: r.title as string,
    targetMinutes: r.target_minutes == null ? null : Number(r.target_minutes),
    doneMinutes: Number(r.done_minutes ?? 0),
    createdByRole: r.created_by_role as 'teacher' | 'student',
    tracked: Boolean(r.tracked),
    status: r.status as AcademicTaskStatus,
    dueAt: (r.due_at as string | null) ?? null,
    undated: Boolean(r.undated),
    weeklyFlowId: (r.weekly_flow_id as string | null) ?? null,
    originFlowId: (r.origin_flow_id as string | null) ?? null,
    plannedForDate: (r.planned_for_date as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
    checklist: (items.get(r.id as string) ?? [])
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...rest }) => rest),
  }))
}

export function isTaskDone(task: Pick<AcademicTask, 'status'>): boolean {
  return task.status === 'done'
}

export function isTaskOpen(task: Pick<AcademicTask, 'status'>): boolean {
  return task.status === 'open'
}

/** Satırın sağındaki kısa durum: "85/120 dk", "1/3", "Tarihsiz", "Açık". */
export function taskProgressLabel(task: AcademicTask): string {
  if (task.kind === 'sure') return `${task.doneMinutes}/${task.targetMinutes ?? 0} dk`
  if (task.status === 'done') return 'Tamamlandı'
  if (task.status === 'closed') return 'Kapatıldı'
  if (task.kind === 'checklist' && task.checklist.length > 0) {
    return `${task.checklist.filter((i) => i.done).length}/${task.checklist.length}`
  }
  return task.undated ? 'Tarihsiz' : 'Açık'
}

// ============================================================
// HIZLI GİRİŞ — "Bir görev yaz ve Enter'a bas" (§3)
//
// Form yok; tür metinden çıkar:
//   "Bu hafta 120 dk"                    → süre hedefi (120)
//   "Kimya yazılısı: Redox / Asit-Baz"   → checklist (2 madde)
//   başka her şey                         → görev
// ============================================================

export interface QuickTask {
  kind: AcademicTaskKind
  title: string
  targetMinutes: number | null
  checklist: string[]
}

const MINUTES_RE = /(\d{1,4})\s*(?:dk|dakika|dak)\b\.?/iu

export function parseQuickTask(input: string): QuickTask | null {
  const text = input.replace(/\s+/g, ' ').trim()
  if (!text) return null

  const minutes = MINUTES_RE.exec(text)
  if (minutes) {
    const n = Number(minutes[1])
    if (n > 0 && n <= 6000) {
      const rest = text.replace(MINUTES_RE, '').replace(/[\s|·:-]+$/u, '').trim()
      return { kind: 'sure', title: rest || `Bu hafta ${n} dk`, targetMinutes: n, checklist: [] }
    }
  }

  const colon = text.indexOf(':')
  if (colon > 0) {
    const head = text.slice(0, colon).trim()
    const parts = text
      .slice(colon + 1)
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean)
    if (head && parts.length >= 2) return { kind: 'checklist', title: head, targetMinutes: null, checklist: parts }
  }

  return { kind: 'gorev', title: text, targetMinutes: null, checklist: [] }
}

// ============================================================
// DERS GRUPLAMASI — Okul / Sınıf dersleri, TYT, AYT (§2)
// ============================================================

export type CourseGroupKey = 'okul' | 'tyt' | 'ayt' | 'diger'

export const COURSE_GROUP_LABEL: Record<CourseGroupKey, string> = {
  okul: 'Okul / Sınıf dersleri',
  tyt: 'TYT',
  ayt: 'AYT',
  diger: 'Diğer',
}

const COURSE_GROUP_ORDER: CourseGroupKey[] = ['okul', 'tyt', 'ayt', 'diger']

/** Seviye alanı boşsa addan okunur ("AYT Geometri", "11. Sınıf Fizik"). */
export function courseGroupOf(course: { name: string; levelExam: string | null }): CourseGroupKey {
  const level = (course.levelExam ?? '').trim()
  const name = course.name.trim().toLocaleUpperCase('tr')
  const probe = level ? level.toLocaleUpperCase('tr') : name
  if (/^(9|10|11|12)\.\s*SINIF/u.test(probe) || /SINIF/u.test(probe)) return 'okul'
  if (probe.startsWith('AYT') || probe.startsWith('2. AŞAMA')) return 'ayt'
  if (probe.startsWith('TYT') || probe.startsWith('1. AŞAMA')) return 'tyt'
  return 'diger'
}

export function groupCourses<T extends { name: string; levelExam: string | null }>(
  courses: T[]
): { key: CourseGroupKey; label: string; courses: T[] }[] {
  const by = new Map<CourseGroupKey, T[]>()
  for (const c of courses) {
    const k = courseGroupOf(c)
    by.set(k, [...(by.get(k) ?? []), c])
  }
  return COURSE_GROUP_ORDER.filter((k) => by.has(k)).map((k) => ({
    key: k,
    label: COURSE_GROUP_LABEL[k],
    courses: by.get(k)!,
  }))
}

/** Ders kartı özeti: "0 kaynak · 2 açık görev · 85/120 dk" (§2). */
export function courseSummaryLine(resourceCount: number, tasks: AcademicTask[]): string {
  const parts = [resourceCount === 0 ? '0 kaynak' : `${resourceCount} aktif kaynak`]
  const open = tasks.filter((t) => t.status === 'open' && t.kind !== 'sure')
  const undated = open.filter((t) => t.undated)
  if (open.length > 0) {
    parts.push(
      undated.length === open.length
        ? `${open.length} tarihsiz açık görev`
        : `${open.length} açık görev`
    )
  }
  for (const t of tasks.filter((x) => x.kind === 'sure' && x.status !== 'draft' && x.status !== 'closed')) {
    parts.push(`${t.doneMinutes}/${t.targetMinutes ?? 0} dk`)
  }
  return parts.join(' · ')
}

/** Taslak sepet özeti — farklı birimler tek toplamda birleşmez (§5). */
export function planSummary(bookUnits: number, tasks: AcademicTask[]) {
  const nonTime = tasks.filter((t) => t.kind !== 'sure')
  const minutes = tasks.filter((t) => t.kind === 'sure').reduce((n, t) => n + (t.targetMinutes ?? 0), 0)
  return { bookUnits, taskCount: nonTime.length, minutes }
}
