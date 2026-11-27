'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { PHOTO_BUCKET } from '@/lib/mistakes/load'
import { mistakeInputSchema, mistakeRow, photoPathAllowed, targetsSchema, type MistakeInput } from '@/lib/mistakes/schema'

// HATA DEFTERİ — öğretmen eylemleri (migration 161). Öğretmen öğrencinin
// defterine (derste birlikte çözülen denemeden) hata ekler, koç notu
// yazar ve günlük hedefleri belirler.

type Result = { error?: string }

function revalidate(studentId: string) {
  revalidatePath(`/teacher/students/${studentId}/hata-defteri`)
  revalidatePath('/teacher/hata-defteri')
}

async function ownStudent(studentId: string) {
  const ctx = await getTeacherContext()
  const { data } = await ctx.supabase
    .from('students')
    .select('id')
    .eq('id', studentId)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle()
  return data ? ctx : null
}

export async function teacherCreateMistakeAction(studentId: string, input: MistakeInput): Promise<Result & { id?: string }> {
  const sid = uuidSchema.safeParse(studentId)
  const parsed = mistakeInputSchema.safeParse(input)
  if (!sid.success) return { error: firstIssue(sid.error) }
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const ctx = await ownStudent(sid.data)
  if (!ctx) return { error: 'Öğrenci bulunamadı.' }
  const v = parsed.data
  if (!photoPathAllowed(v.questionPhotoPath, ctx.workspaceId, sid.data) || !photoPathAllowed(v.solutionPhotoPath, ctx.workspaceId, sid.data))
    return { error: 'Fotoğraf yüklenemedi; yeniden deneyin.' }
  const { data, error } = await ctx.supabase
    .from('mistakes')
    .insert({ ...mistakeRow(v), workspace_id: ctx.workspaceId, student_id: sid.data, created_by_role: 'teacher' })
    .select('id')
    .single()
  if (error || !data) return { error: dbErrorToTr(error?.message ?? 'Hata kaydedilemedi.') }
  revalidate(sid.data)
  return { id: data.id }
}

export async function setTeacherNoteAction(studentId: string, mistakeId: string, note: string): Promise<Result> {
  const parsed = z
    .object({ studentId: uuidSchema, mistakeId: uuidSchema, note: z.string().trim().max(1000, 'En fazla 1000 karakter.') })
    .safeParse({ studentId, mistakeId, note })
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const ctx = await ownStudent(parsed.data.studentId)
  if (!ctx) return { error: 'Öğrenci bulunamadı.' }
  const { error } = await ctx.supabase
    .from('mistakes')
    .update({ teacher_note: parsed.data.note || null })
    .eq('id', parsed.data.mistakeId)
    .eq('student_id', parsed.data.studentId)
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate(parsed.data.studentId)
  revalidatePath('/student', 'layout')
  return {}
}

export async function teacherDeleteMistakeAction(studentId: string, mistakeId: string): Promise<Result> {
  const parsed = z.object({ studentId: uuidSchema, mistakeId: uuidSchema }).safeParse({ studentId, mistakeId })
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const ctx = await ownStudent(parsed.data.studentId)
  if (!ctx) return { error: 'Öğrenci bulunamadı.' }
  const { data: row } = await ctx.supabase
    .from('mistakes')
    .select('question_photo_path, solution_photo_path')
    .eq('id', parsed.data.mistakeId)
    .eq('student_id', parsed.data.studentId)
    .maybeSingle()
  if (!row) return { error: 'Kayıt bulunamadı.' }
  const { error } = await ctx.supabase.from('mistakes').delete().eq('id', parsed.data.mistakeId)
  if (error) return { error: dbErrorToTr(error.message) }
  const paths = [row.question_photo_path, row.solution_photo_path].filter((p): p is string => !!p)
  if (paths.length) await ctx.supabase.storage.from(PHOTO_BUCKET).remove(paths)
  revalidate(parsed.data.studentId)
  return {}
}

export async function setStudyTargetsAction(
  studentId: string,
  targets: { dailyQuestions: number; dailyReviews: number }
): Promise<Result> {
  const sid = uuidSchema.safeParse(studentId)
  const parsed = targetsSchema.safeParse(targets)
  if (!sid.success) return { error: firstIssue(sid.error) }
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const ctx = await ownStudent(sid.data)
  if (!ctx) return { error: 'Öğrenci bulunamadı.' }
  const { error } = await ctx.supabase.from('study_targets').upsert(
    {
      student_id: sid.data,
      workspace_id: ctx.workspaceId,
      daily_questions: parsed.data.dailyQuestions,
      daily_reviews: parsed.data.dailyReviews,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'student_id' }
  )
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate(sid.data)
  revalidatePath('/student', 'layout')
  return {}
}
