'use server'

// Akademik Not / Öğrenci Hafızası (R6-07).
//
// Bu notlar YALNIZ eğitmenin gördüğü kayıtlardır. Öğrenci ve veli
// sorgularında hiçbir zaman expose edilmez; güvence RLS seviyesinde
// (031_academic_notes) — o tabloda öğrenci/veli politikası yoktur.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

const addSchema = z.object({
  studentId: uuidSchema,
  noteText: z
    .string()
    .trim()
    .min(1, 'Not boş olamaz.')
    .max(2000, 'Not en fazla 2000 karakter olabilir.'),
  pinned: z.boolean().default(false),
})

export async function addAcademicNoteAction(
  studentId: string,
  noteText: string,
  pinned = false
) {
  const parsed = addSchema.safeParse({ studentId, noteText, pinned })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('add_academic_note', {
    p_student_id: parsed.data.studentId,
    p_note_text: parsed.data.noteText,
    p_pinned: parsed.data.pinned,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

export async function setAcademicNotePinnedAction(
  studentId: string,
  noteId: string,
  pinned: boolean
) {
  const parsed = uuidSchema.safeParse(noteId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_academic_note_pinned', {
    p_note_id: parsed.data,
    p_pinned: pinned,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

export async function deleteAcademicNoteAction(studentId: string, noteId: string) {
  const parsed = uuidSchema.safeParse(noteId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('delete_academic_note', { p_note_id: parsed.data })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}
