import { TeacherSidebar } from '@/components/teacher/teacher-sidebar'
import { getTeacherContext } from '@/lib/workspace'

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { workspace, profile, activeTerm } = await getTeacherContext()

  return (
    <div className="flex min-h-screen">
      <TeacherSidebar
        workspaceName={workspace.name}
        userName={profile.full_name}
        activeTerm={activeTerm?.name}
      />
      <main className="flex-1 overflow-auto md:pt-0 pt-14">
        {children}
      </main>
    </div>
  )
}
