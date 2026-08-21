import { AppSidebar } from '@/components/shared/app-sidebar'
import { getTeacherContext } from '@/lib/workspace'

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { supabase, workspace, workspaceId, profile, activeTerm } = await getTeacherContext()

  // Sidebar'daki aktif öğrenci seçicisi için hafif liste. /teacher/students
  // ile aynı view; seçici yalnız öğrenci bağlamındaki rotalarda gösterilir.
  const { data: studentRows } = await supabase
    .from('teacher_student_overview_view')
    .select('student_id, student_full_name, grade_level, exam_type')
    .eq('workspace_id', workspaceId)
    .order('student_full_name')
    .limit(500)

  const students = (studentRows ?? []).map((s) => ({
    id: s.student_id as string,
    fullName: (s.student_full_name as string | null) ?? '—',
    gradeLevel: (s.grade_level as string | null) ?? null,
    examType: (s.exam_type as string | null) ?? null,
  }))

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        title={workspace.name}
        role="teacher"
        roleLabel="Öğretmen"
        userName={profile.full_name}
        panel={activeTerm ? { label: 'Aktif dönem', items: [activeTerm.name] } : undefined}
        students={students}
      />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
