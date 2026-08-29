'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

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

  if (error) return { error: dbErrorToTr(error.message) }
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

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath('/teacher/tasks')
  revalidatePath('/teacher')
  return { success: true }
}

// Toplu onay (R3 v2 §E): 100 test için 100 ayrı onay tıklaması beklenemez.
// Alttaki homework_items ve test_completions kayıtları tek tek korunur.
export async function approveHomeworkBatchAction(homeworkBatchId: string, bookId?: string) {
  const parsedBatch = uuidSchema.safeParse(homeworkBatchId)
  if (!parsedBatch.success) return { error: firstIssue(parsedBatch.error) }

  let parsedBookId: string | null = null
  if (bookId) {
    const parsedBook = uuidSchema.safeParse(bookId)
    if (!parsedBook.success) return { error: firstIssue(parsedBook.error) }
    parsedBookId = parsedBook.data
  }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('approve_homework_items_bulk', {
    p_homework_batch_id: parsedBatch.data,
    p_book_id: parsedBookId,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath('/teacher/tasks')
  revalidatePath('/teacher')
  return { success: true }
}

/**
 * Seçili kalemleri onaylar (R6-08).
 *
 * approveHomeworkBatchAction "grubun hepsini onayla" der; bu ise eğitmenin
 * drawer'da gözden geçirip bazılarını çıkardığı listeyi onaylar. Kaç kalemin
 * gerçekten onaylandığı geri döndürülür — kısmi başarı gizlenmez.
 */
export async function approveSelectedItemsAction(homeworkItemIds: string[]) {
  const parsed = z.array(uuidSchema).min(1, 'En az bir çalışma seçin.').max(500)
    .safeParse(homeworkItemIds)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('approve_selected_homework_items', {
    p_homework_item_ids: parsed.data,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/tasks')
  revalidatePath('/teacher')
  return { success: true, approved: Number((data as { approved?: number })?.approved ?? 0) }
}
