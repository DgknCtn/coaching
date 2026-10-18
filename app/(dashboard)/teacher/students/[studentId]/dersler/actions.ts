'use server'

// DERSLER + AKADEMİK GÖREVLER — öğretmen yazma yolları (M1.0-03, 148).
//
// Yetki kuralları (öğrenci öğretmen görevini silemez, takibe alınmış
// görev silinemez, taslak öğrenciye görünmez) RPC'lerde yaşıyor; burası
// doğrulama + revalidate katmanı.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

type Result = { error?: string; success?: boolean }

function revalidate(studentId: string) {
  revalidatePath(`/teacher/students/${studentId}/dersler`, 'layout')
  revalidatePath(`/teacher/students/${studentId}/homework/new`)
  revalidatePath(`/teacher/students/${studentId}/haftalik-akis`)
  revalidatePath(`/teacher/students/${studentId}/goals`)
  revalidatePath('/student/haftam')
}

// ============================================================
// DERS HAVUZU
// ============================================================

const addCoursesSchema = z.object({
  studentId: uuidSchema,
  scopeIds: z.array(uuidSchema).max(50),
  newNames: z.array(z.string().trim().min(2, 'Ders adı en az 2 karakter.').max(80)).max(20),
})

/** Toplu ders ekleme: katalogdan seçilenler + yeni yazılan adlar (§2). */
export async function addCoursesAction(input: z.input<typeof addCoursesSchema>): Promise<Result & { added?: number }> {
  const parsed = addCoursesSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { studentId, scopeIds, newNames } = parsed.data
  if (scopeIds.length === 0 && newNames.length === 0) return { error: 'En az bir ders seçin.' }

  const { supabase, workspaceId } = await getTeacherContext()
  const ids = new Set(scopeIds)
  for (const name of newNames) {
    const level = /^(TYT|AYT)\b/i.exec(name)?.[1]?.toUpperCase() ?? (/^(9|10|11|12)\.\s*Sınıf/i.exec(name)?.[0] ?? null)
    const { data, error } = await supabase.rpc('upsert_academic_scope', {
      p_workspace_id: workspaceId,
      p_name: name,
      p_subject: null,
      p_level_exam: level,
    })
    if (error) return { error: dbErrorToTr(error.message) }
    const id = (data as { scope_id?: string } | null)?.scope_id
    if (id) ids.add(id)
  }

  // Pasife alınmış ders yeniden eklenirse geri açılır (geçmişi duruyordu).
  const { error } = await supabase.from('student_courses').upsert(
    [...ids].map((scopeId) => ({ workspace_id: workspaceId, student_id: studentId, scope_id: scopeId, active: true })),
    { onConflict: 'student_id,scope_id' }
  )
  if (error) return { error: dbErrorToTr(error.message) }

  revalidate(studentId)
  return { success: true, added: ids.size }
}

export async function setCourseActiveAction(studentId: string, scopeId: string, active: boolean): Promise<Result> {
  const parsed = z
    .object({ studentId: uuidSchema, scopeId: uuidSchema, active: z.boolean() })
    .safeParse({ studentId, scopeId, active })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { supabase, workspaceId } = await getTeacherContext()
  const { error } = await supabase
    .from('student_courses')
    .upsert(
      { workspace_id: workspaceId, student_id: studentId, scope_id: scopeId, active },
      { onConflict: 'student_id,scope_id' }
    )
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate(studentId)
  return { success: true }
}

// ============================================================
// GÖREVLER
// ============================================================

const taskSchema = z.object({
  studentId: uuidSchema,
  scopeId: uuidSchema,
  kind: z.enum(['gorev', 'checklist', 'sure']),
  title: z.string().trim().min(1, 'Görev metni boş olamaz.').max(300),
  targetMinutes: z.number().int().min(1).max(6000).nullable().optional(),
  checklist: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  undated: z.boolean().optional(),
  /** true: aktif haftaya doğrudan ("Bu haftaya ekle"); false: taslak sepet. */
  publish: z.boolean().optional(),
})

export type TaskInput = z.input<typeof taskSchema>

async function insertTask(supabase: Awaited<ReturnType<typeof getTeacherContext>>['supabase'], v: z.infer<typeof taskSchema>) {
  return supabase.rpc('create_academic_task', {
    p_student_id: v.studentId,
    p_scope_id: v.scopeId,
    p_kind: v.kind,
    p_title: v.title,
    p_target_minutes: v.kind === 'sure' ? (v.targetMinutes ?? null) : null,
    p_checklist: v.kind === 'checklist' ? (v.checklist ?? []) : null,
    p_undated: v.undated ?? false,
    p_due_at: null,
    p_publish: v.publish ?? false,
  })
}

export async function createTaskAction(input: TaskInput): Promise<Result & { id?: string }> {
  const parsed = taskSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  if (parsed.data.kind === 'sure' && !parsed.data.targetMinutes) return { error: 'Süre hedefi için dakika girin.' }

  const { supabase } = await getTeacherContext()
  const { data, error } = await insertTask(supabase, parsed.data)
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate(parsed.data.studentId)
  return { success: true, id: data as string }
}

/** Toplu Yapıştır önizlemesinden "N çalışmayı sepete ekle" (§4). */
export async function createTasksBulkAction(
  studentId: string,
  rows: Omit<TaskInput, 'studentId' | 'publish'>[]
): Promise<Result & { created?: number }> {
  const parsed = z.array(taskSchema.omit({ studentId: true, publish: true })).max(100).safeParse(rows)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  if (!uuidSchema.safeParse(studentId).success) return { error: 'Geçersiz öğrenci.' }

  const { supabase } = await getTeacherContext()
  let created = 0
  for (const row of parsed.data) {
    const { error } = await insertTask(supabase, { ...row, studentId, publish: false })
    if (error) {
      revalidate(studentId)
      return { error: `${created} çalışma eklendi; "${row.title}" eklenemedi: ${dbErrorToTr(error.message)}`, created }
    }
    created++
  }
  revalidate(studentId)
  return { success: true, created }
}

export async function updateTaskAction(input: {
  studentId: string
  taskId: string
  title: string
  targetMinutes?: number | null
}): Promise<Result> {
  const parsed = z
    .object({
      studentId: uuidSchema,
      taskId: uuidSchema,
      title: z.string().trim().min(1, 'Görev metni boş olamaz.').max(300),
      targetMinutes: z.number().int().min(1).max(6000).nullable().optional(),
    })
    .safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { supabase } = await getTeacherContext()
  const { error } = await supabase.rpc('update_academic_task', {
    p_task_id: parsed.data.taskId,
    p_title: parsed.data.title,
    p_target_minutes: parsed.data.targetMinutes ?? null,
    p_undated: null,
    p_due_at: null,
    p_clear_due: false,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate(parsed.data.studentId)
  return { success: true }
}

/**
 * Satır istisnası (§5): plan teslimi (varsayılan), farklı teslim tarihi,
 * tarihsiz. `mode: 'plan'` teslimi boşaltır — yayında plan teslimi yazılır.
 */
export async function setTaskDueAction(input: {
  studentId: string
  taskId: string
  title: string
  mode: 'plan' | 'date' | 'undated'
  dueAtIso?: string | null
}): Promise<Result> {
  const parsed = z
    .object({
      studentId: uuidSchema,
      taskId: uuidSchema,
      title: z.string().trim().min(1).max(300),
      mode: z.enum(['plan', 'date', 'undated']),
      dueAtIso: z.string().datetime({ offset: true }).nullable().optional(),
    })
    .safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const v = parsed.data
  if (v.mode === 'date' && !v.dueAtIso) return { error: 'Teslim tarihi seçin.' }

  const { supabase } = await getTeacherContext()
  const { error } = await supabase.rpc('update_academic_task', {
    p_task_id: v.taskId,
    p_title: v.title,
    p_target_minutes: null,
    p_undated: v.mode === 'undated',
    p_due_at: v.mode === 'date' ? v.dueAtIso : null,
    p_clear_due: v.mode === 'plan',
  })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate(v.studentId)
  return { success: true }
}

export async function deleteTaskAction(studentId: string, taskId: string): Promise<Result> {
  const parsed = z.object({ studentId: uuidSchema, taskId: uuidSchema }).safeParse({ studentId, taskId })
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { supabase } = await getTeacherContext()
  const { error } = await supabase.rpc('delete_academic_task', { p_task_id: taskId })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate(studentId)
  return { success: true }
}

/** Öğrencinin kendi görevini öğretmen radarına al (§8). */
export async function setTaskTrackedAction(studentId: string, taskId: string, tracked: boolean): Promise<Result> {
  const parsed = z
    .object({ studentId: uuidSchema, taskId: uuidSchema, tracked: z.boolean() })
    .safeParse({ studentId, taskId, tracked })
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { supabase } = await getTeacherContext()
  const { error } = await supabase.rpc('set_academic_task_tracked', { p_task_id: taskId, p_tracked: tracked })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate(studentId)
  return { success: true }
}

/** Tarihsiz görevi kapat ("artık gerekmiyor") ya da yeniden aç. */
export async function setTaskClosedAction(studentId: string, taskId: string, closed: boolean): Promise<Result> {
  const parsed = z
    .object({ studentId: uuidSchema, taskId: uuidSchema, closed: z.boolean() })
    .safeParse({ studentId, taskId, closed })
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { supabase } = await getTeacherContext()
  const { error } = await supabase.rpc('set_academic_task_closed', { p_task_id: taskId, p_closed: closed })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate(studentId)
  return { success: true }
}

/** Taslak görevleri aktif haftaya yayınla (Planı Yayınla'nın görev ayağı). */
export async function publishDraftTasksAction(studentId: string, dueAtIso: string | null): Promise<Result & { published?: number }> {
  if (!uuidSchema.safeParse(studentId).success) return { error: 'Geçersiz öğrenci.' }
  const { supabase } = await getTeacherContext()
  const { data, error } = await supabase.rpc('publish_draft_academic_tasks', {
    p_student_id: studentId,
    p_due_at: dueAtIso,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate(studentId)
  return { success: true, published: Number(data ?? 0) }
}
