import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import {
  ACTIVE_WORKSPACE_COOKIE,
  resolveActiveWorkspaceId,
  type WorkspaceMembership,
} from '@/lib/active-workspace'

/** Çerezdeki tercih. Doğrulanmamış ham değer — tek başına kullanılmaz. */
async function readActiveWorkspaceCookie(): Promise<string | null> {
  const store = await cookies()
  return store.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null
}

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

  // Profil ve TÜM öğretmen üyelikleri tek sorguda. Önceden yalnız
  // default_workspace_id'nin üyeliği çekiliyordu; artık kullanıcı
  // workspace değiştirebildiği için hepsi gerekiyor (Faz 3).
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'id, full_name, email, default_workspace_id, workspace_members(role, workspace_id, status)'
    )
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Askıya alınmış kiracının üyelikleri RLS tarafından zaten süzülür (051):
  // workspace_members okuması has_workspace_role'den geçiyor.
  const memberships: WorkspaceMembership[] = (
    (profile.workspace_members ?? []) as unknown as {
      role: string
      workspace_id: string
      status: string
    }[]
  )
    .filter(m => m.status === 'active' && ['owner', 'teacher'].includes(m.role))
    .map(m => ({ workspaceId: m.workspace_id, role: m.role }))

  const workspaceId = resolveActiveWorkspaceId(
    memberships,
    await readActiveWorkspaceCookie(),
    profile.default_workspace_id
  )

  // Öğretmen üyeliği olmayan kullanıcı buraya ait değil.
  if (!workspaceId) redirect('/login')

  const [{ data: workspace }, { data: activeTerm }, { data: allWorkspaces }] =
    await Promise.all([
      supabase.from('workspaces').select('id, name').eq('id', workspaceId).single(),
      supabase
        .from('academic_terms')
        .select('id, name, status')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Seçici için: yalnız BİR workspace varsa arayüzde hiç gösterilmez.
      supabase
        .from('workspaces')
        .select('id, name')
        .in('id', [...new Set(memberships.map(m => m.workspaceId))])
        .order('name'),
    ])

  // Workspace okunamıyorsa (askıya alınmış ya da silinmiş) oturum bu
  // bağlamda geçersizdir.
  if (!workspace) redirect('/login')

  return {
    supabase,
    profile: profile as unknown as {
      id: string
      full_name: string
      email: string | null
      default_workspace_id: string
    },
    workspace,
    workspaceId,
    role: memberships.find(m => m.workspaceId === workspaceId)?.role ?? 'teacher',
    activeTerm: activeTerm as { id: string; name: string; status: string } | null,
    /** Kullanıcının öğretmen olduğu tüm çalışma alanları (seçici için). */
    workspaces: (allWorkspaces ?? []) as { id: string; name: string }[],
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
