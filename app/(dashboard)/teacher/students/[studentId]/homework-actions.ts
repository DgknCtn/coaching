'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'

export async function approveHomeworkItemAction(homeworkItemId: string, studentId: string) {
  const parsed = uuidSchema.safeParse(homeworkItemId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('approve_homework_item', {
    p_homework_item_id: homeworkItemId,
  })

  if (error) return { error: error.message }
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

const rejectSchema = z.object({
  homeworkItemId: uuidSchema,
  note: z.string().trim().max(500).optional().or(z.literal('')),
})

export async function rejectHomeworkItemAction(homeworkItemId: string, studentId: string, note?: string) {
  const parsed = rejectSchema.safeParse({ homeworkItemId, note })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('reject_homework_item', {
    p_homework_item_id: parsed.data.homeworkItemId,
    p_note: parsed.data.note || null,
  })

  if (error) return { error: error.message }
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}
