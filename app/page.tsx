import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, default_workspace_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile?.default_workspace_id) redirect('/login')

  // owner ve teacher için 2 ayrı satır olabilir — ilkini al
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('profile_id', profile.id)
    .eq('workspace_id', profile.default_workspace_id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!member) redirect('/login')

  if (member.role === 'owner' || member.role === 'teacher') redirect('/teacher')
  if (member.role === 'student') redirect('/student')
  if (member.role === 'parent') redirect('/parent')

  redirect('/login')
}
