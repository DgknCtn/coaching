import type { SupabaseClient } from '@supabase/supabase-js'
import { CHECKLIST_SELECT, TASK_SELECT, mapTasks, type AcademicTask } from '@/lib/academic-tasks'

// Akademik görev okuma (M1.0-03, 148). Öğretmen ve öğrenci ekranları AYNI
// yükleyiciden beslenir; RLS (öğrenci taslağı görmez) farkı veritabanında.

export interface StudentCourse {
  scopeId: string
  name: string
  levelExam: string | null
  active: boolean
}

/** Öğrencinin Ders Havuzu (pasifler dahil, `active` ile işaretli). */
export async function loadStudentCourses(
  supabase: SupabaseClient,
  { studentId }: { studentId: string }
): Promise<StudentCourse[]> {
  const { data: rows, error } = await supabase
    .from('student_courses')
    .select('scope_id, active')
    .eq('student_id', studentId)
  if (error) throw new Error(`Ders havuzu okunamadı: ${error.message}`)
  const ids = ((rows ?? []) as { scope_id: string }[]).map((r) => r.scope_id)
  if (ids.length === 0) return []
  const { data: scopes } = await supabase
    .from('academic_scopes')
    .select('id, name, level_exam, sort_order')
    .in('id', ids)
  const byId = new Map(
    ((scopes ?? []) as { id: string; name: string; level_exam: string | null; sort_order: number | null }[]).map(
      (s) => [s.id, s]
    )
  )
  return ((rows ?? []) as { scope_id: string; active: boolean }[])
    .filter((r) => byId.has(r.scope_id))
    .map((r) => {
      const s = byId.get(r.scope_id)!
      return { scopeId: r.scope_id, name: s.name, levelExam: s.level_exam, active: r.active, sort: s.sort_order ?? 0 }
    })
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'tr'))
    .map(({ sort: _sort, ...c }) => c)
}

/**
 * Öğrencinin görevleri. `statuses` verilmezse taslak + açık + tamamlanan +
 * kapatılan hepsi. Ders adları görevin kendi alanlarından okunur.
 */
export async function loadStudentTasks(
  supabase: SupabaseClient,
  {
    studentId,
    statuses,
    createdByProfileId,
  }: {
    studentId: string
    statuses?: AcademicTask['status'][]
    /** Taslak sepet öğretmene özeldir (weekly_plan_drafts ile aynı kural). */
    createdByProfileId?: string
  }
): Promise<AcademicTask[]> {
  let query = supabase.from('academic_tasks').select(TASK_SELECT).eq('student_id', studentId)
  if (statuses) query = query.in('status', statuses)
  if (createdByProfileId) query = query.eq('created_by_profile_id', createdByProfileId)
  const { data: rows, error } = await query.order('created_at')
  if (error) throw new Error(`Görevler okunamadı: ${error.message}`)
  const taskRows = (rows ?? []) as Record<string, unknown>[]
  if (taskRows.length === 0) return []

  const ids = taskRows.map((r) => r.id as string)
  const scopeIds = Array.from(new Set(taskRows.map((r) => r.scope_id as string)))
  const [{ data: items }, { data: scopes }] = await Promise.all([
    supabase.from('academic_task_checklist_items').select(CHECKLIST_SELECT).in('task_id', ids),
    supabase.from('academic_scopes').select('id, name').in('id', scopeIds),
  ])
  const names = new Map(((scopes ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]))
  return mapTasks(taskRows, (items ?? []) as Record<string, unknown>[], names)
}
