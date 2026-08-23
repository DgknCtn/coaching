import { AppSidebar } from '@/components/shared/app-sidebar'
import { getSidebarCollapsed } from '@/lib/sidebar-prefs'
import { getParentContext } from '@/lib/workspace'

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const { profile, linkedStudents } = await getParentContext()

  const studentNames = linkedStudents.map((l) => l.students.full_name)
  const collapsed = await getSidebarCollapsed()

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        title="Veli Paneli"
        role="parent"
        roleLabel="Veli"
        userName={profile.full_name}
        panel={studentNames.length ? { label: 'Takip edilen', items: studentNames } : undefined}
        defaultCollapsed={collapsed}
      />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
