'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getStudentContext } from '@/lib/workspace'
import { checkInSchema, uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { todayDateString } from '@/lib/homework-status'

// R5.1: çalışmanın GERÇEKTEN yapıldığı gün. Öğrenci geçmiş bir gün
// seçebilir ("dün çalıştım, bugün işaretliyorum"); gelecek gün seçemez.
// Verilmezse RPC bugünü kullanır — mevcut davranış korunur.
function normalizeStudiedOn(value?: string): string | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value > todayDateString() ? null : value
}

export async function submitHomeworkItemAction(homeworkItemId: string, studiedOn?: string) {
  const parsed = uuidSchema.safeParse(homeworkItemId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getStudentContext() // auth check
  const supabase = await createClient()

  const { error } = await supabase.rpc('submit_homework_item_for_approval', {
    p_homework_item_id: homeworkItemId,
    p_studied_on: normalizeStudiedOn(studiedOn),
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath('/student')
  return { success: true }
}

// Toplu gönderim (R3 v2 §D): 100 testlik haftada öğrencinin 100 kez butona
// basması beklenemez. Arka planda kalemler yine tek tek güncellenir; bu yalnız
// arayüz kolaylığıdır.
export async function submitHomeworkBatchAction(
  homeworkBatchId: string,
  bookId?: string,
  studiedOn?: string
) {
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
    p_studied_on: normalizeStudiedOn(studiedOn),
  })

  if (error) return { error: dbErrorToTr(error.message) }
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

  if (error) return { error: dbErrorToTr(error.message) }
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

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath('/student')
  return { success: true }
}

// R4 §6: video görevini öğrenci kendi işaretler, öğretmen onayı gerekmez.
// Video plan temposuna dahil olmadığı için homework_items'a değil, ayrı ve
// hafif video_watch_marks tablosuna yazılır (023).
export async function markVideoWatchedAction(assignmentId: string, sectionId: string | null) {
  const parsedAssignment = uuidSchema.safeParse(assignmentId)
  if (!parsedAssignment.success) return { error: firstIssue(parsedAssignment.error) }

  if (sectionId !== null) {
    const parsedSection = uuidSchema.safeParse(sectionId)
    if (!parsedSection.success) return { error: firstIssue(parsedSection.error) }
  }

  const { workspaceId, student } = await getStudentContext()
  const supabase = await createClient()

  // Atama gerçekten bu öğrenciye mi ait? RLS (023) zaten yabancı bir
  // atamaya yazmayı reddediyor, ama tek savunma katmanı DB olmamalı —
  // uygulama katmanı da doğrulasın.
  const { data: assignment } = await supabase
    .from('student_book_assignments')
    .select('id')
    .eq('id', parsedAssignment.data)
    .eq('student_id', student.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!assignment) return { error: 'Bu kitap sana atanmamış.' }

  // Aynı kaynağı iki kez işaretlemek hata değildir; benzersiz indeks
  // (023) çakışmayı sessizce yutar.
  const { error } = await supabase
    .from('video_watch_marks')
    .upsert(
      {
        workspace_id: workspaceId,
        student_book_assignment_id: parsedAssignment.data,
        section_id: sectionId,
      },
      { ignoreDuplicates: true }
    )

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath('/student')
  return { success: true }
}
