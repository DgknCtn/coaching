import { AppSidebar } from '@/components/shared/app-sidebar'
import { getStudentContext } from '@/lib/workspace'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { student } = await getStudentContext()

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        title={student.full_name}
        role="student"
        roleLabel="Öğrenci"
        userName={student.full_name}
      />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
