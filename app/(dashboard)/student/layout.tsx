import { StudentSidebar } from '@/components/student/student-sidebar'
import { getStudentContext } from '@/lib/workspace'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { profile, student } = await getStudentContext()

  return (
    <div className="flex min-h-screen">
      <StudentSidebar studentName={student.full_name} />
      <main className="flex-1 overflow-auto md:pt-0 pt-14">
        {children}
      </main>
    </div>
  )
}
