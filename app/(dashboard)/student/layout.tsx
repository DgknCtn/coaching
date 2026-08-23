import { AppSidebar } from '@/components/shared/app-sidebar'
import { getSidebarCollapsed } from '@/lib/sidebar-prefs'
import { getStudentContext } from '@/lib/workspace'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { student } = await getStudentContext()
  const collapsed = await getSidebarCollapsed()

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        title={student.full_name}
        role="student"
        roleLabel="Öğrenci"
        userName={student.full_name}
        defaultCollapsed={collapsed}
      />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
