'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { studentSchema, assignBookSchema, uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

export async function createStudentAction(
  fullName: string,
  email: string | undefined,
  phone: string | undefined,
  gradeLevel: string | undefined,
  examType: string | undefined,
  lessonType: string | undefined,
  notes: string | undefined
) {
  const parsed = studentSchema.safeParse({ fullName, email, phone, gradeLevel, examType, lessonType, notes })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId, profile } = await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase.from('students').insert({
    workspace_id: workspaceId,
    primary_teacher_profile_id: profile.id,
    full_name: fullName,
    email: email || null,
    phone: phone || null,
    grade_level: gradeLevel || null,
    exam_type: examType || null,
    lesson_type: lessonType || null,
    notes: notes || null,
    status: 'active',
  }).select('id').single()

  if (error) return { error: dbErrorToTr(error.message) }

  // R6-07: Notlar sekmesi artık academic_notes'u gösteriyor. students.notes
  // geriye dönük uyum için yazılmaya devam ediyor ama TEK BAŞINA yeterli
  // değil — buraya yazılan not hiçbir ekranda görünmezdi. Bu yüzden ilk not
  // aynı zamanda bir akademik not olarak açılır.
  if (notes && notes.trim()) {
    await supabase.rpc('add_academic_note', {
      p_student_id: data.id,
      p_note_text: notes.trim(),
      p_pinned: false,
    })
  }

  revalidatePath('/teacher/students')
  redirect(`/teacher/students/${data.id}`)
}

export async function updateStudentAction(
  studentId: string,
  fullName: string,
  email: string | undefined,
  phone: string | undefined,
  gradeLevel: string | undefined,
  examType: string | undefined,
  lessonType: string | undefined,
  notes: string | undefined
) {
  const parsed = studentSchema.safeParse({ fullName, email, phone, gradeLevel, examType, lessonType, notes })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  // R6-07: notes artık düzenleme formunda YOKTUR (notlar academic_notes'ta
  // yönetiliyor). Bu yüzden `notes` tanımsız geldiğinde eski değeri EZMEYİZ —
  // aksi halde düzenleme, geriye dönük uyum için tutulan kolonu sessizce
  // temizlerdi.
  const { error } = await supabase
    .from('students')
    .update({
      full_name: fullName,
      email: email || null,
      phone: phone || null,
      grade_level: gradeLevel || null,
      exam_type: examType || null,
      lesson_type: lessonType || null,
      ...(notes === undefined ? {} : { notes: notes || null }),
    })
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

export async function assignBookAction(
  studentId: string,
  bookId: string,
  startDate: string | undefined,
  targetEndDate: string | undefined
) {
  const parsed = assignBookSchema.safeParse({ studentId, bookId, startDate, targetEndDate })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId, activeTerm } = await getTeacherContext()
  const supabase = await createClient()

  if (!activeTerm) return { error: 'Aktif dönem bulunamadı' }

  const { error } = await supabase.rpc('assign_book_to_student', {
    p_workspace_id: workspaceId,
    p_student_id: studentId,
    p_book_id: bookId,
    p_academic_term_id: activeTerm.id,
    p_start_date: startDate || null,
    p_target_end_date: targetEndDate || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

export async function removeBookAssignmentAction(assignmentId: string, studentId: string) {
  const parsed = uuidSchema.safeParse(assignmentId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('student_book_assignments')
    .update({ status: 'archived' })
    .eq('id', parsed.data)
    .eq('workspace_id', workspaceId)

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

export async function archiveStudentAction(studentId: string) {
  const parsed = uuidSchema.safeParse(studentId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('students')
    .update({ status: 'archived' })
    .eq('id', parsed.data)
    .eq('workspace_id', workspaceId)

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath('/teacher/students')
  redirect('/teacher/students')
}
