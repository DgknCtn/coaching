'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'

export async function createStudentAction(
  fullName: string,
  email: string | undefined,
  phone: string | undefined,
  gradeLevel: string | undefined,
  examType: string | undefined,
  notes: string | undefined
) {
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
    notes: notes || null,
    status: 'active',
  }).select('id').single()

  if (error) return { error: error.message }
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
  notes: string | undefined
) {
  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('students')
    .update({
      full_name: fullName,
      email: email || null,
      phone: phone || null,
      grade_level: gradeLevel || null,
      exam_type: examType || null,
      notes: notes || null,
    })
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)

  if (error) return { error: error.message }
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

export async function assignBookAction(
  studentId: string,
  bookId: string,
  startDate: string | undefined,
  targetEndDate: string | undefined
) {
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

  if (error) return { error: error.message }
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

export async function removeBookAssignmentAction(assignmentId: string, studentId: string) {
  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('student_book_assignments')
    .update({ status: 'archived' })
    .eq('id', assignmentId)
    .eq('workspace_id', workspaceId)

  if (error) return { error: error.message }
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

export async function archiveStudentAction(studentId: string) {
  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('students')
    .update({ status: 'archived' })
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)

  if (error) return { error: error.message }
  revalidatePath('/teacher/students')
  redirect('/teacher/students')
}
