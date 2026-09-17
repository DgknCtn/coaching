'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { logAudit } from '@/lib/audit'

export async function approveHomeworkItemAction(homeworkItemId: string, studentId: string) {
  const parsed = uuidSchema.safeParse(homeworkItemId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('approve_homework_item', {
    p_homework_item_id: homeworkItemId,
  })

  if (error) return { error: dbErrorToTr(error.message) }
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

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

// Toplu onay (R3 v2 §E): 100 test için 100 ayrı onay tıklaması beklenemez.
// Alttaki homework_items ve test_completions kayıtları tek tek korunur.
export async function approveHomeworkBatchAction(homeworkBatchId: string, studentId: string, bookId?: string) {
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
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

// ============================================================
// AKTİF YÜKTEN ÇIKAR — R7-06.01
// ============================================================
//
// Ekranda "Sil" DEĞİL "Aktif Yükten Çıkar" yazıyor ve bu bilinçli: işlem
// hiçbir şey silmiyor. Ödev geçmişte kalıyor, tamamlanan kısmı
// korunuyor, yalnız öğrencinin aktif borcundan düşüyor.
//
// Belgenin gerekçesi: eski gecikmiş ödevler aylar boyunca öğrencinin
// yapılacak/geciken listesinde kalabiliyordu ve öğrenciyi yıl boyu
// "borçlu" tutuyordu.

const releaseSchema = z.object({
  studentId: uuidSchema,
  // Tekil ve toplu işlem AYNI yol: kart menüsünden tek id, toplu
  // seçimden çok id gelir. İki ayrı action, aynı kuralı iki yere
  // yazmak olurdu.
  batchIds: z.array(uuidSchema).min(1, 'En az bir ödev seçilmeli.'),
})

export async function releaseFromActiveLoadAction(studentId: string, batchIds: string[]) {
  const parsed = releaseSchema.safeParse({ studentId, batchIds })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('release_batch_from_active_load', {
    p_batch_ids: parsed.data.batchIds,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'homework.release_from_active_load',
    entityType: 'student',
    entityId: parsed.data.studentId,
    detail: { batchIds: parsed.data.batchIds, released: data },
  })

  revalidateStudentHomework(parsed.data.studentId)
  return { success: true, released: Number(data ?? 0) }
}

const restoreSchema = z.object({
  studentId: uuidSchema,
  batchId: uuidSchema,
  // HEDEF AKIŞ ZORUNLU: belge *"eski teslim tarihi diriltilmemeli;
  // aktif/gelecek Haftalık Akış seçilerek yeni akışın son teslimini
  // miras almalı"* diyor. Tarihsiz bir yeniden aktifleştirme, ödevi
  // doğduğu anda "süresi geçmiş" yapardı.
  weeklyFlowId: uuidSchema,
})

export async function restoreToActiveLoadAction(
  studentId: string,
  batchId: string,
  weeklyFlowId: string
) {
  const parsed = restoreSchema.safeParse({ studentId, batchId, weeklyFlowId })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('restore_batch_to_active_load', {
    p_batch_id: parsed.data.batchId,
    p_weekly_flow_id: parsed.data.weeklyFlowId,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'homework.restore_to_active_load',
    entityType: 'student',
    entityId: parsed.data.studentId,
    detail: { batchId: parsed.data.batchId, weeklyFlowId: parsed.data.weeklyFlowId },
  })

  revalidateStudentHomework(parsed.data.studentId)
  return { success: true }
}

/**
 * Aktif yük değiştiğinde tazelenmesi gereken YERLER.
 *
 * Öğrencinin kendi ekranı DA listede: aktif yükten çıkarılan ödev
 * öğrencinin Ödevlerim ve Haftam ekranlarından düşmeli. Yalnız öğretmen
 * sayfası tazelenseydi öğrenci borcu düşmüş ödevi görmeye devam ederdi.
 */
function revalidateStudentHomework(studentId: string) {
  revalidatePath(`/teacher/students/${studentId}`)
  revalidatePath(`/teacher/students/${studentId}/haftalik-akis`)
  revalidatePath('/teacher')
  revalidatePath('/teacher/tasks')
  revalidatePath('/student')
  revalidatePath('/student/haftam')
}
