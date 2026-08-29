import { notFound } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { PageHeader } from '@/components/shared/page-header'
import { StudentForm } from '../../new/student-form'

// Öğrenci düzenleme (R6-11).
//
// StudentForm `mode='edit'` desteğini zaten taşıyordu ve updateStudentAction
// da vardı; eksik olan tek şey bu route'tu. Bu yüzden R6-11'in yeni
// alanları (Hazırlık Programı, Çalışma Modeli) ve R6-07'nin notları
// öğrenci oluşturulduktan SONRA da düzenlenebilir hale geliyor.

export const dynamic = 'force-dynamic'

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, email, phone, grade_level, exam_type, lesson_type')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!student) notFound()

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <PageHeader
        backHref={`/teacher/students/${studentId}`}
        title="Öğrenciyi düzenle"
        subtitle={student.full_name}
      />

      <StudentForm
        mode="edit"
        studentId={studentId}
        defaultValues={{
          fullName: student.full_name ?? '',
          email: student.email ?? '',
          phone: student.phone ?? '',
          gradeLevel: student.grade_level ?? '',
          examType: student.exam_type ?? '',
          lessonType: student.lesson_type ?? '',
        }}
      />
    </div>
  )
}
