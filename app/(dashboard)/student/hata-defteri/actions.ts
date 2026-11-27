'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getStudentContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { PHOTO_BUCKET } from '@/lib/mistakes/load'
import {
  mistakeInputSchema,
  mistakeRow,
  photoPathAllowed,
  questionLogRow,
  questionLogSchema,
  type MistakeInput,
  type QuestionLogInput,
} from '@/lib/mistakes/schema'

// HATA DEFTERİ — öğrenci eylemleri (migration 161). Yazma öğrencinin
// kendi oturumuyla; RLS yalnız kendi kayıtlarına izin verir. Kutu ve
// sonraki tekrar tarihi YALNIZ record_mistake_review ile değişir.

type Result = { error?: string }

function revalidate() {
  revalidatePath('/student', 'layout')
}

export async function createMistakeAction(input: MistakeInput): Promise<Result & { id?: string }> {
  const parsed = mistakeInputSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { supabase, student, workspaceId } = await getStudentContext()
  const v = parsed.data
  if (!photoPathAllowed(v.questionPhotoPath, workspaceId, student.id) || !photoPathAllowed(v.solutionPhotoPath, workspaceId, student.id))
    return { error: 'Fotoğraf yüklenemedi; yeniden deneyin.' }
  const { data, error } = await supabase
    .from('mistakes')
    .insert({ ...mistakeRow(v), workspace_id: workspaceId, student_id: student.id, created_by_role: 'student' })
    .select('id')
    .single()
  if (error || !data) return { error: dbErrorToTr(error?.message ?? 'Hata kaydedilemedi.') }
  // Kutu 1 ve ilk tekrar (bugün) mistakes_init tetikleyicisinden gelir.
  revalidate()
  return { id: data.id }
}

export async function reviewMistakeAction(
  mistakeId: string,
  result: 'knew' | 'missed'
): Promise<Result & { status?: string; nextReviewOn?: string | null }> {
  const parsed = z.object({ id: uuidSchema, result: z.enum(['knew', 'missed']) }).safeParse({ id: mistakeId, result })
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { supabase } = await getStudentContext()
  const { data, error } = await supabase.rpc('record_mistake_review', { p_mistake_id: parsed.data.id, p_result: parsed.data.result })
  if (error) return { error: dbErrorToTr(error.message) }
  const r = data as { status: string; next_review_on: string | null }
  return { status: r.status, nextReviewOn: r.next_review_on }
}

export async function finishReviewAction(): Promise<void> {
  revalidate()
}

export async function setMistakeArchivedAction(mistakeId: string, archived: boolean): Promise<Result> {
  const parsed = uuidSchema.safeParse(mistakeId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { supabase, student } = await getStudentContext()
  const { error } = await supabase
    .from('mistakes')
    .update({ status: archived ? 'archived' : 'review' })
    .eq('id', parsed.data)
    .eq('student_id', student.id)
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate()
  return {}
}

export async function deleteMistakeAction(mistakeId: string): Promise<Result> {
  const parsed = uuidSchema.safeParse(mistakeId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { supabase, student } = await getStudentContext()
  const { data: row } = await supabase
    .from('mistakes')
    .select('question_photo_path, solution_photo_path')
    .eq('id', parsed.data)
    .eq('student_id', student.id)
    .maybeSingle()
  if (!row) return { error: 'Kayıt bulunamadı.' }
  const { error } = await supabase.from('mistakes').delete().eq('id', parsed.data).eq('student_id', student.id)
  if (error) return { error: dbErrorToTr(error.message) }
  const paths = [row.question_photo_path, row.solution_photo_path].filter((p): p is string => !!p)
  if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths)
  revalidate()
  return {}
}

export async function logQuestionsAction(input: QuestionLogInput): Promise<Result> {
  const parsed = questionLogSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { supabase, student, workspaceId } = await getStudentContext()
  const { error } = await supabase
    .from('question_logs')
    .insert({ ...questionLogRow(parsed.data), workspace_id: workspaceId, student_id: student.id })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate()
  return {}
}

export async function deleteQuestionLogAction(logId: string): Promise<Result> {
  const parsed = uuidSchema.safeParse(logId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { supabase, student } = await getStudentContext()
  const { error } = await supabase.from('question_logs').delete().eq('id', parsed.data).eq('student_id', student.id)
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate()
  return {}
}
