'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getStudentContext } from '@/lib/workspace'

export async function markCompletedAction(homeworkItemId: string) {
  await getStudentContext() // auth check
  const supabase = await createClient()

  const { error } = await supabase.rpc('mark_homework_item_completed', {
    p_homework_item_id: homeworkItemId,
  })

  if (error) return { error: error.message }
  revalidatePath('/student')
  return { success: true }
}

export async function revertCompletedAction(homeworkItemId: string) {
  await getStudentContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('revert_homework_item_completion', {
    p_homework_item_id: homeworkItemId,
  })

  if (error) return { error: error.message }
  revalidatePath('/student')
  return { success: true }
}
