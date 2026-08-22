'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { homeworkBatchSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

interface HomeworkItem {
  student_book_assignment_id: string
  book_test_id: string
}

export async function createHomeworkBatchAction(
  workspaceId: string,
  termId: string,
  studentId: string,
  dueDate: string,
  title: string | undefined,
  items: HomeworkItem[]
) {
  const parsed = homeworkBatchSchema.safeParse({ workspaceId, termId, studentId, dueDate, title, items })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  // workspaceId istemciden de geliyor (imza korunuyor) ama RPC'ye
  // OTURUMUN workspace'i gönderilir. Önceden istemcinin değeri doğrudan
  // iletiliyordu; tek savunma katmanı RPC'nin içindeki rol kontrolüydü.
  const { workspaceId: sessionWorkspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('create_homework_batch', {
    p_workspace_id: sessionWorkspaceId,
    p_academic_term_id: termId,
    p_student_id: studentId,
    p_due_date: dueDate,
    p_title: title || null,
    p_description: null,
    p_items: items,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath(`/teacher/students/${studentId}`)
  revalidatePath('/teacher')
  return { success: true }
}
