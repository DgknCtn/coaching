import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function getTeacherContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, default_workspace_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile?.default_workspace_id) redirect('/login')

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('profile_id', profile.id)
    .eq('workspace_id', profile.default_workspace_id)
    .eq('status', 'active')
    .in('role', ['owner', 'teacher'])
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!member) redirect('/login')

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', profile.default_workspace_id)
    .single()

  const { data: activeTerm } = await supabase
    .from('academic_terms')
    .select('id, name, status')
    .eq('workspace_id', profile.default_workspace_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    supabase,
    profile: profile as { id: string; full_name: string; email: string | null; default_workspace_id: string },
    workspace: workspace!,
    workspaceId: profile.default_workspace_id as string,
    role: member.role as string,
    activeTerm: activeTerm as { id: string; name: string; status: string } | null,
  }
}

export async function getStudentContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, default_workspace_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile?.default_workspace_id) redirect('/login')

  const { data: studentRecord } = await supabase
    .from('students')
    .select('id, full_name, workspace_id, exam_type')
    .eq('profile_id', profile.id)
    .eq('workspace_id', profile.default_workspace_id)
    .single()

  if (!studentRecord) redirect('/login')

  const { data: activeTerm } = await supabase
    .from('academic_terms')
    .select('id, name')
    .eq('workspace_id', profile.default_workspace_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    supabase,
    profile: profile as { id: string; full_name: string; email: string | null; default_workspace_id: string },
    student: studentRecord,
    workspaceId: profile.default_workspace_id as string,
    activeTerm: activeTerm as { id: string; name: string } | null,
  }
}

export async function getParentContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, default_workspace_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile?.default_workspace_id) redirect('/login')

  const { data: linkedStudents } = await supabase
    .from('parent_student_links')
    .select('id, student_id, students(id, full_name, exam_type, grade_level)')
    .eq('parent_profile_id', profile.id)
    .eq('workspace_id', profile.default_workspace_id)
    .eq('status', 'active')

  if (!linkedStudents?.length) redirect('/login')

  return {
    supabase,
    profile: profile as { id: string; full_name: string; email: string | null; default_workspace_id: string },
    workspaceId: profile.default_workspace_id as string,
    linkedStudents: linkedStudents as unknown as Array<{
      id: string
      student_id: string
      students: { id: string; full_name: string; exam_type: string | null; grade_level: string | null }
    }>,
  }
}
