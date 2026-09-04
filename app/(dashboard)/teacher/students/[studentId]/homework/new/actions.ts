'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { homeworkBatchSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { logAudit } from '@/lib/audit'
import { trackFeature } from '@/lib/telemetry'

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
  items: HomeworkItem[],
  note?: string
) {
  const parsed = homeworkBatchSchema.safeParse({
    workspaceId,
    termId,
    studentId,
    dueDate,
    title,
    note,
    items,
  })
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
    // R6-05: Ödev Notu. homework_batches.description 001'den beri vardı ve
    // kullanılmıyordu; yeni kolon açmak yerine o alan kullanılır.
    p_description: parsed.data.note || null,
    p_items: items,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  // Ödev yayınlama ürünün merkezi eylemi: hem denetim kaydına hem
  // kullanım sayacına girer.
  await logAudit(supabase, {
    workspaceId: sessionWorkspaceId,
    action: 'homework.publish',
    entityType: 'student',
    entityId: parsed.data.studentId,
    detail: { itemCount: parsed.data.items.length, dueDate: parsed.data.dueDate },
  })
  await trackFeature(supabase, sessionWorkspaceId, 'homework.publish')


  revalidatePath(`/teacher/students/${studentId}`)
  revalidatePath('/teacher')
  return { success: true }
}
