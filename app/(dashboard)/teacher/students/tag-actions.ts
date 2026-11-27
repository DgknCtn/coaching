'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { TAG_COLORS } from '@/lib/student-tags'

// ÖĞRENCİ ETİKETLERİ (PRD 10.2 · Faz 2b, migration 159). Yazma yalnız
// RPC'lerden: etiket ile öğrencinin aynı alanda olduğu orada doğrulanır.

const nameSchema = z.string().trim().min(1, 'Etiket adı boş olamaz.').max(40, 'Etiket adı en fazla 40 karakter.')
const colorSchema = z.enum(TAG_COLORS)

function revalidate(studentId?: string) {
  revalidatePath('/teacher/students')
  if (studentId) revalidatePath(`/teacher/students/${studentId}`, 'layout')
}

/** Yeni etiket oluşturur (aynı ad varsa onu kullanır) ve öğrenciye bağlar. */
export async function createAndAttachTagAction(
  studentId: string,
  name: string,
  color: string
): Promise<{ error?: string; tagId?: string }> {
  const parsed = z.object({ studentId: uuidSchema, name: nameSchema, color: colorSchema }).safeParse({ studentId, name, color })
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()
  const { data: tagId, error } = await supabase.rpc('create_student_tag', {
    p_workspace_id: workspaceId,
    p_name: parsed.data.name,
    p_color: parsed.data.color,
  })
  if (error || !tagId) return { error: dbErrorToTr(error?.message ?? 'Etiket oluşturulamadı.') }
  const { error: linkError } = await supabase.rpc('set_student_tag', {
    p_student_id: parsed.data.studentId,
    p_tag_id: tagId as string,
    p_on: true,
  })
  if (linkError) return { error: dbErrorToTr(linkError.message) }
  revalidate(parsed.data.studentId)
  return { tagId: tagId as string }
}

export async function setStudentTagAction(studentId: string, tagId: string, on: boolean): Promise<{ error?: string }> {
  if (!uuidSchema.safeParse(studentId).success || !uuidSchema.safeParse(tagId).success) return { error: 'Geçersiz kayıt.' }
  await getTeacherContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_student_tag', { p_student_id: studentId, p_tag_id: tagId, p_on: on })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate(studentId)
  return {}
}

export async function updateTagAction(
  tagId: string,
  input: { name?: string; color?: string; remove?: boolean }
): Promise<{ error?: string }> {
  if (!uuidSchema.safeParse(tagId).success) return { error: 'Geçersiz etiket.' }
  if (!input.remove) {
    const ok = z.object({ name: nameSchema, color: colorSchema }).safeParse(input)
    if (!ok.success) return { error: firstIssue(ok.error) }
  }
  await getTeacherContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_student_tag', {
    p_tag_id: tagId,
    p_name: input.name ?? '',
    p_color: input.color ?? '',
    p_delete: input.remove ?? false,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidate()
  return {}
}
