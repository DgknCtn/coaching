'use server'

import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue, weeklyPlanDraftSchema } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

// Haftalık plan taslağı: seçimler sayfa yenilemede kaybolmasın diye
// Supabase'de tutulur (019_weekly_plan_drafts). Taslak yayınlanmış ödev
// DEĞİLDİR — ilerlemeye sayılmaz, öğrenciye görünmez.

export async function saveWeeklyPlanDraftAction(
  workspaceId: string,
  studentId: string,
  dueDate: string | undefined,
  title: string | undefined,
  items: { student_book_assignment_id: string; book_test_id: string }[],
  note?: string
) {
  const parsed = weeklyPlanDraftSchema.safeParse({
    workspaceId,
    studentId,
    dueDate,
    title,
    note,
    items,
  })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  // RPC'ye oturumun workspace'i gider; istemcinin gönderdiği değer değil.
  const { workspaceId: sessionWorkspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('upsert_weekly_plan_draft', {
    p_workspace_id: sessionWorkspaceId,
    p_student_id: parsed.data.studentId,
    p_due_date: parsed.data.dueDate || null,
    p_title: parsed.data.title || null,
    p_items: parsed.data.items,
    p_note: parsed.data.note || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  return { success: true }
}

export async function clearWeeklyPlanDraftAction(workspaceId: string, studentId: string) {
  const parsedWorkspace = uuidSchema.safeParse(workspaceId)
  const parsedStudent = uuidSchema.safeParse(studentId)
  if (!parsedWorkspace.success) return { error: firstIssue(parsedWorkspace.error) }
  if (!parsedStudent.success) return { error: firstIssue(parsedStudent.error) }

  const { workspaceId: sessionWorkspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('clear_weekly_plan_draft', {
    p_workspace_id: sessionWorkspaceId,
    p_student_id: parsedStudent.data,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  return { success: true }
}
