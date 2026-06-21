'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { generateToken, hashToken } from '@/lib/invite'

export async function createInviteAction(studentId: string, role: 'student' | 'parent') {
  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const { data: student } = await supabase
    .from('students')
    .select('id, email')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student) return { error: 'Öğrenci bulunamadı' }

  const token = generateToken()
  const tokenHash = await hashToken(token)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('invitations').insert({
    workspace_id: workspaceId,
    invited_email: role === 'student' ? student.email : null,
    role,
    student_id: studentId,
    parent_student_link_id: null,
    token_hash: tokenHash,
    expires_at: expiresAt,
    status: 'pending',
  })

  if (error) return { error: error.message }

  revalidatePath(`/teacher/students/${studentId}`)
  return { link: `${appUrl}/invite/${token}` }
}
