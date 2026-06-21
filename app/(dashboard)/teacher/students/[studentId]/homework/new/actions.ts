'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'

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
  await getTeacherContext() // auth check
  const supabase = await createClient()

  const { error } = await supabase.rpc('create_homework_batch', {
    p_workspace_id: workspaceId,
    p_academic_term_id: termId,
    p_student_id: studentId,
    p_due_date: dueDate,
    p_title: title || null,
    p_description: null,
    p_items: items,
  })

  if (error) return { error: error.message }

  revalidatePath(`/teacher/students/${studentId}`)
  revalidatePath('/teacher')
  return { success: true }
}
