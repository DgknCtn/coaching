import type { SupabaseClient } from '@supabase/supabase-js'
import { loadStudentScopes, loadWorkspaceScopes, type StudentScope } from '@/lib/student-scopes'
import { loadStudentCourses, loadStudentTasks } from '@/lib/academic-tasks-load'
import type { AcademicTask } from '@/lib/academic-tasks'

// Dersler ekranlarının ortak verisi (M1.0-03 §2).

export interface CourseView {
  scopeId: string
  name: string
  levelExam: string | null
  active: boolean
}

export interface CoursesData {
  courses: CourseView[]
  tasks: AcademicTask[]
  resourceCount: Map<string, number>
  workspaceScopes: StudentScope[]
  activeFlow: { id: string; dueAt: string } | null
  /** Aktif haftada yayınlanmış plan (kitap ödevi veya görev) var mı? */
  planPublished: boolean
}

export async function loadCoursesData(
  supabase: SupabaseClient,
  { workspaceId, studentId }: { workspaceId: string; studentId: string }
): Promise<CoursesData> {
  const [pool, union, workspaceScopes, { data: assignments }, { data: flow }] = await Promise.all([
    loadStudentCourses(supabase, { studentId }),
    loadStudentScopes(supabase, { workspaceId, studentId }),
    loadWorkspaceScopes(supabase, { workspaceId }),
    supabase
      .from('student_book_assignments')
      .select('scope_id')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .in('status', ['active', 'pending'])
      .not('scope_id', 'is', null),
    supabase
      .from('weekly_flows')
      .select('id, due_at')
      .eq('student_id', studentId)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  // Müfredattan ya da kitaptan gelen ama havuzda olmayan alan havuza
  // yazılır (148'in backfill'inden sonra atanan kitaplar). Görev ancak
  // havuzdaki aktif derse eklenebildiği için bu senkron gerekli.
  const inPool = new Set(pool.map((c) => c.scopeId))
  const missing = union.filter((s) => !inPool.has(s.id))
  if (missing.length > 0) {
    await supabase.from('student_courses').upsert(
      missing.map((s) => ({ workspace_id: workspaceId, student_id: studentId, scope_id: s.id, active: true })),
      { onConflict: 'student_id,scope_id', ignoreDuplicates: true }
    )
  }
  const courses: CourseView[] = [
    ...pool,
    ...missing.map((s) => ({ scopeId: s.id, name: s.name, levelExam: s.levelExam, active: true })),
  ]

  const tasks = await loadStudentTasks(supabase, { studentId })

  const resourceCount = new Map<string, number>()
  for (const r of (assignments ?? []) as { scope_id: string }[]) {
    resourceCount.set(r.scope_id, (resourceCount.get(r.scope_id) ?? 0) + 1)
  }

  let planPublished = false
  if (flow) {
    const { count } = await supabase
      .from('homework_batches')
      .select('id', { count: 'exact', head: true })
      .eq('weekly_flow_id', flow.id as string)
      .eq('status', 'active')
    planPublished =
      (count ?? 0) > 0 ||
      tasks.some((t) => t.weeklyFlowId === flow.id && t.createdByRole === 'teacher' && t.status !== 'draft')
  }

  return {
    courses,
    tasks,
    resourceCount,
    workspaceScopes,
    activeFlow: flow ? { id: flow.id as string, dueAt: flow.due_at as string } : null,
    planPublished,
  }
}
