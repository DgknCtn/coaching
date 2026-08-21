'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getStudentContext } from '@/lib/workspace'
import { checkInSchema, uuidSchema, firstIssue } from '@/lib/validation'

export async function submitHomeworkItemAction(homeworkItemId: string) {
  const parsed = uuidSchema.safeParse(homeworkItemId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getStudentContext() // auth check
  const supabase = await createClient()

  const { error } = await supabase.rpc('submit_homework_item_for_approval', {
    p_homework_item_id: homeworkItemId,
  })

  if (error) return { error: error.message }
  revalidatePath('/student')
  return { success: true }
}

// Toplu gönderim (R3 v2 §D): 100 testlik haftada öğrencinin 100 kez butona
// basması beklenemez. Arka planda kalemler yine tek tek güncellenir; bu yalnız
// arayüz kolaylığıdır.
export async function submitHomeworkBatchAction(homeworkBatchId: string, bookId?: string) {
  const parsedBatch = uuidSchema.safeParse(homeworkBatchId)
  if (!parsedBatch.success) return { error: firstIssue(parsedBatch.error) }

  let parsedBookId: string | null = null
  if (bookId) {
    const parsedBook = uuidSchema.safeParse(bookId)
    if (!parsedBook.success) return { error: firstIssue(parsedBook.error) }
    parsedBookId = parsedBook.data
  }

  await getStudentContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('submit_homework_items_bulk', {
    p_homework_batch_id: parsedBatch.data,
    p_book_id: parsedBookId,
  })

  if (error) return { error: error.message }
  revalidatePath('/student')
  return { success: true }
}

export async function revertCompletedAction(homeworkItemId: string) {
  const parsed = uuidSchema.safeParse(homeworkItemId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getStudentContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('revert_homework_item_completion', {
    p_homework_item_id: homeworkItemId,
  })

  if (error) return { error: error.message }
  revalidatePath('/student')
  return { success: true }
}

export async function submitCheckInAction(checkInId: string, mood: string, message: string) {
  const parsed = checkInSchema.safeParse({ checkInId, mood, message })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getStudentContext() // auth check
  const supabase = await createClient()

  const { error } = await supabase.rpc('submit_student_check_in', {
    p_check_in_id: parsed.data.checkInId,
    p_mood: parsed.data.mood,
    p_message: parsed.data.message || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/student')
  return { success: true }
}
