import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { HomeworkBuilder } from './homework-builder'

export const dynamic = 'force-dynamic'

export default async function NewHomeworkPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const { supabase, workspaceId, activeTerm } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student) notFound()

  if (!activeTerm) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Link href={`/teacher/students/${studentId}`}>
            <Button variant="ghost" size="icon-sm"><ArrowLeft className="size-4" /></Button>
          </Link>
          <h1 className="text-xl font-semibold">Ödev Ver</h1>
        </div>
        <div className="flex items-center gap-2 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">Aktif dönem bulunamadı. Önce bir dönem aktif edin.</p>
        </div>
      </div>
    )
  }

  // Load student's active book assignments with their sections and tests
  const { data: assignments } = await supabase
    .from('student_book_assignments')
    .select(`
      id, book_id, start_date, target_end_date,
      books(
        id, title, subject, exam_type,
        book_sections(
          id, title, order_index,
          book_tests(id, title, order_index, status)
        )
      )
    `)
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')

  // Get already pending test IDs for this student (to show warnings)
  const { data: pendingItems } = await supabase
    .from('homework_items')
    .select('book_test_id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .in(
      'student_book_assignment_id',
      (assignments ?? []).map(a => a.id)
    )

  const pendingTestIds = new Set((pendingItems ?? []).map(i => i.book_test_id))

  // Get completed test IDs
  const { data: completedItems } = await supabase
    .from('test_completions')
    .select('book_test_id')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .in(
      'student_book_assignment_id',
      (assignments ?? []).map(a => a.id)
    )

  const completedTestIds = new Set((completedItems ?? []).map(i => i.book_test_id))

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/teacher/students/${studentId}`}>
          <Button variant="ghost" size="icon-sm"><ArrowLeft className="size-4" /></Button>
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Ödev Ver</h1>
          <p className="text-sm text-muted-foreground">{student.full_name}</p>
        </div>
      </div>

      {!assignments?.length ? (
        <div className="py-12 text-center text-muted-foreground">
          <p>Bu öğrenciye atanmış kitap yok.</p>
          <Link href={`/teacher/students/${studentId}`} className="mt-3 inline-block">
            <Button variant="outline" size="sm">Kitap Ata</Button>
          </Link>
        </div>
      ) : (
        <HomeworkBuilder
          studentId={studentId}
          termId={activeTerm.id}
          workspaceId={workspaceId}
          studentName={student.full_name}
          assignments={assignments as any}
          pendingTestIds={[...pendingTestIds]}
          completedTestIds={[...completedTestIds]}
        />
      )}
    </div>
  )
}
