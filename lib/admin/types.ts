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

/** admin_teacher_activity (124) — öğretmen adıyla. */
export interface TeacherActivity {
  profile_id: string
  teacher_name: string | null
  teacher_email: string | null
  workspace_id: string
  workspace_name: string
  last_login_at: string | null
  logins: number
  homework_published: number
  approvals: number
  sessions_marked: number
  active_students: number
}

/** admin_feature_usage (124) — eylem türü; detail yok. */
export interface FeatureUsage {
  action: string
  total: number
  workspaces: number
  last_at: string
}

/** admin_revenue (124) — tutarlar kuruş. */
export interface Revenue {
  monthly: { month: string; kurus: number; orders: number }[]
  active_licenses: number
  licensed_students: number
  expiring: {
    workspace_id: string
    workspace_name: string
    kind: 'license' | 'trial'
    ends_at: string
    student_count: number | null
  }[]
  failed: {
    order_id: string
    workspace_id: string
    workspace_name: string
    kurus: number
    reason: string | null
    at: string
  }[]
  pending: {
    order_id: string
    workspace_id: string
    workspace_name: string
    kurus: number
    created_at: string
    has_token: boolean
  }[]
}

const monthFormatter = new Intl.DateTimeFormat('tr-TR', { month: 'short', year: '2-digit', timeZone: 'UTC' })

/** "2026-09" → "Eyl 26" */
export function monthLabel(yyyyMm: string): string {
  return monthFormatter.format(new Date(`${yyyyMm}-01T00:00:00Z`))
}

/** admin_workspace_activity (124) — öğretmenler adıyla, öğrenci/veli yalnız sayı. */
export interface WorkspaceActivity {
  daily: { day: string; published: number; submitted: number; approved: number }[]
  teachers: { name: string | null; email: string | null; role: string; last_login_at: string | null }[]
  counts: {
    students: number
    students_with_account: number
    parents: number
    active_students_7d: number
    open_interventions: number
  }
  actions: { action: string; total: number }[]
  failed_orders: { kurus: number; reason: string | null; at: string }[]
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
