// Yönetim RPC dönüş tipleri (124). Tek yerde: sayfalar aynı şekli okur.

export interface UserCounts {
  teachers: number
  students: number
  students_with_account: number
  parents: number
  active_teachers_7d: number
  active_teachers_30d: number
  active_students_7d: number
  active_students_30d: number
  active_parents_7d: number
  active_parents_30d: number
  new_workspaces_30d: number
}

export interface DayRow {
  day: string
  new_workspaces: number
  active_users: number
  logins: number
  failed_logins: number
  homework_published: number
  approvals: number
  submissions: number
  sessions_done: number
  revenue_kurus: number
}

export interface Overview {
  total_workspaces: number
  trial_workspaces: number
  licensed_workspaces: number
  total_students: number
  open_tickets: number
  revenue_kurus: number
  pending_kurus: number
  expiring_trials: number
  awaiting_payment: number
  at_student_limit: number
  unmatched_orders: number
}

export interface SystemStatus {
  db_bytes: number
  tables: { name: string; bytes: number; rows: number }[]
  cron: { job: string; started_at: string; ok: boolean | null; affected: number | null; error: string | null }[]
  purge_overdue: number
  deletion_pending: number
  deletion_due: number
  pin_locked: number
  rate_limit_rows: number
}

const dayFormatter = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "2026-09-27" → "27 Eyl" (gün zaten yerel gün olarak geliyor). */
export function dayLabel(isoDay: string): string {
  return dayFormatter.format(new Date(`${isoDay}T00:00:00Z`))
}

/** 1,2 GB / 340 MB / 12 kB */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} MB`
  return `${Math.round(bytes / 1024).toLocaleString('tr-TR')} kB`
}
