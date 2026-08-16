import { AppSidebar } from '@/components/shared/app-sidebar'
import { parentNav } from '@/components/nav-config'
import { getParentContext } from '@/lib/workspace'

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const { profile, linkedStudents } = await getParentContext()

  const studentNames = linkedStudents.map((l) => l.students.full_name)

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        title="Veli Paneli"
        roleLabel="Veli"
        userName={profile.full_name}
        items={parentNav}
        panel={studentNames.length ? { label: 'Takip edilen', items: studentNames } : undefined}
      />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
