'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'

// students/[studentId]/homework-actions.ts ile aynı RPC'ler; tek fark
// revalidate hedefi — buradan onaylanan iş dashboard sayaçlarını da düşürür.

export async function approveFromTasksAction(homeworkItemId: string) {
  const parsed = uuidSchema.safeParse(homeworkItemId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('approve_homework_item', {
    p_homework_item_id: parsed.data,
  })

  if (error) return { error: error.message }
  revalidatePath('/teacher/tasks')
  revalidatePath('/teacher')
  return { success: true }
}

const rejectSchema = z.object({
  homeworkItemId: uuidSchema,
  note: z.string().trim().max(500).optional().or(z.literal('')),
})

export async function rejectFromTasksAction(homeworkItemId: string, note?: string) {
  const parsed = rejectSchema.safeParse({ homeworkItemId, note })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('reject_homework_item', {
    p_homework_item_id: parsed.data.homeworkItemId,
    p_note: parsed.data.note || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/teacher/tasks')
  revalidatePath('/teacher')
  return { success: true }
}
