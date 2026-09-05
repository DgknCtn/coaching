import { AppSidebar } from '@/components/shared/app-sidebar'
import { BRAND } from '@/lib/brand'
import { getSidebarCollapsed } from '@/lib/sidebar-prefs'
import { getTeacherContext } from '@/lib/workspace'

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { supabase, workspaceId, profile, activeTerm, workspaces } =
    await getTeacherContext()

  // Sidebar'daki aktif öğrenci seçicisi için hafif liste. /teacher/students
  // ile aynı view; seçici yalnız öğrenci bağlamındaki rotalarda gösterilir.
  const { data: studentRows } = await supabase
    .from('teacher_student_overview_view')
    .select('student_id, student_full_name, grade_level, exam_type')
    .eq('workspace_id', workspaceId)
    .order('student_full_name')
    .limit(500)

  const collapsed = await getSidebarCollapsed()

  const students = (studentRows ?? []).map((s) => ({
    id: s.student_id as string,
    fullName: (s.student_full_name as string | null) ?? '—',
    gradeLevel: (s.grade_level as string | null) ?? null,
    examType: (s.exam_type as string | null) ?? null,
  }))

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        // Üstte MARKA duruyor, çalışma alanı adı değil. Varsayılan
        // workspace adı "{ad} Workspace" olduğundan (058) aynı isim
        // sidebar'ın üstünde ve altında iki kez görünüyordu. Çalışma
        // alanı adı zaten hemen altındaki seçicide yazıyor.
        title={BRAND.name}
        role="teacher"
        roleLabel="Öğretmen"
        userName={profile.full_name}
        panel={activeTerm ? { label: 'Aktif dönem', items: [activeTerm.name] } : undefined}
        students={students}
        workspaces={workspaces}
        activeWorkspaceId={workspaceId}
        defaultCollapsed={collapsed}
        // /admin hiçbir yerden bağlantılı değildi; adresi elle yazmak
        // gerekiyordu. Bayrak profil satırında zaten okunuyor, ek sorgu yok.
        isPlatformAdmin={profile.is_platform_admin === true}
      />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
