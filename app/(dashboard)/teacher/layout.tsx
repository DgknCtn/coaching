import { AppSidebar } from '@/components/shared/app-sidebar'
import { getTeacherContext } from '@/lib/workspace'

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { workspace, profile, activeTerm } = await getTeacherContext()

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        title={workspace.name}
        role="teacher"
        roleLabel="Öğretmen"
        userName={profile.full_name}
        panel={activeTerm ? { label: 'Aktif dönem', items: [activeTerm.name] } : undefined}
      />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
