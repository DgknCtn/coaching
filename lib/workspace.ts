import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Bu üç fonksiyon React.cache() ile sarılıdır: layout ve sayfa AYNI istek
// içinde aynı context'i çağırdığında sorgular yalnız bir kez çalışır.
// Önceden öğretmen sayfası başına ~10 gidiş-dönüş ödeniyordu (layout 5 +
// sayfa 5); dedupe ile bu tek sefere iner.
//
// İkinci kazanç: profil alındıktan sonra birbirinden bağımsız olan üyelik,
// workspace ve aktif dönem sorguları Promise.all ile tek dalgada çalışır.
// Dönen nesne ve redirect koşulları AYNEN korunur — çağıran hiçbir ekran
// farkı görmez.

export const getTeacherContext = cache(async function getTeacherContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, default_workspace_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile?.default_workspace_id) redirect('/login')

  const [{ data: member }, { data: workspace }, { data: activeTerm }] = await Promise.all([
    supabase
      .from('workspace_members')
      .select('role')
      .eq('profile_id', profile.id)
      .eq('workspace_id', profile.default_workspace_id)
      .eq('status', 'active')
      .in('role', ['owner', 'teacher'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('workspaces')
      .select('id, name')
      .eq('id', profile.default_workspace_id)
      .single(),
    supabase
      .from('academic_terms')
      .select('id, name, status')
      .eq('workspace_id', profile.default_workspace_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // Yetki kontrolü sorgular paralelleştirildikten SONRA da aynı noktada
  // uygulanır: üyeliği olmayan kullanıcı yine /login'e gider.
  if (!member) redirect('/login')

  return {
    supabase,
    profile: profile as { id: string; full_name: string; email: string | null; default_workspace_id: string },
    workspace: workspace!,
    workspaceId: profile.default_workspace_id as string,
    role: member.role as string,
    activeTerm: activeTerm as { id: string; name: string; status: string } | null,
  }
})

export const getStudentContext = cache(async function getStudentContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, default_workspace_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile?.default_workspace_id) redirect('/login')

  const [{ data: studentRecord }, { data: activeTerm }] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, workspace_id, exam_type')
      .eq('profile_id', profile.id)
      .eq('workspace_id', profile.default_workspace_id)
      .single(),
    supabase
      .from('academic_terms')
      .select('id, name')
      .eq('workspace_id', profile.default_workspace_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!studentRecord) redirect('/login')

  return {
    supabase,
    profile: profile as { id: string; full_name: string; email: string | null; default_workspace_id: string },
    student: studentRecord,
    workspaceId: profile.default_workspace_id as string,
    activeTerm: activeTerm as { id: string; name: string } | null,
  }
})

export const getParentContext = cache(async function getParentContext() {
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

  // Bağlı öğrencisi olmayan veliyi /login'e YÖNLENDİRME: middleware girişli
  // kullanıcıyı /'a, / da rolü veli görüp /parent'a geri gönderdiği için bu
  // sonsuz döngüye ve beyaz ekrana yol açıyordu. Bunun yerine boş liste
  // döndürülür; /parent sayfası "Bağlı öğrenci yok" boş durumunu gösterir.

  return {
    supabase,
    profile: profile as { id: string; full_name: string; email: string | null; default_workspace_id: string },
    workspaceId: profile.default_workspace_id as string,
    linkedStudents: (linkedStudents ?? []) as unknown as Array<{
      id: string
      student_id: string
      students: { id: string; full_name: string; exam_type: string | null; grade_level: string | null }
    }>,
  }
})
