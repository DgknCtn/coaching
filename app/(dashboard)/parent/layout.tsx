import { ParentSidebar } from '@/components/parent/parent-sidebar'
import { getParentContext } from '@/lib/workspace'

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const { profile, linkedStudents } = await getParentContext()

  const studentNames = linkedStudents.map(l => l.students.full_name)

  return (
    <div className="flex min-h-screen">
      <ParentSidebar parentName={profile.full_name} studentNames={studentNames} />
      <main className="flex-1 overflow-auto md:pt-0 pt-14">
        {children}
      </main>
    </div>
  )
}
