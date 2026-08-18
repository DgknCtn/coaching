'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { checkInScheduleSchema, firstIssue } from '@/lib/validation'

export async function saveCheckInScheduleAction(
  studentId: string,
  intervalDays: number,
  isActive: boolean
) {
  const parsed = checkInScheduleSchema.safeParse({ studentId, intervalDays, isActive })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('upsert_check_in_schedule', {
    p_student_id: parsed.data.studentId,
    p_interval_days: parsed.data.intervalDays,
    p_is_active: parsed.data.isActive,
  })

  if (error) return { error: error.message }
  revalidatePath(`/teacher/students/${parsed.data.studentId}`)
  revalidatePath('/teacher')
  return { success: true }
}
