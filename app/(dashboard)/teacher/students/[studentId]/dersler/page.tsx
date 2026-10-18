import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GraduationCap } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { courseSummaryLine, groupCourses } from '@/lib/academic-tasks'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { BulkPasteDialog } from '@/components/academic/bulk-paste-dialog'
import { loadCoursesData } from './load'
import { AddCoursesDialog, CourseActiveToggle } from './courses-client'

// DERSLER (M1.0-03 §2) — ders kaynakların başlığı değil, ana akademik
// alan. 0 kaynak boş ders demek değildir: kaynağı olmayan "11. Sınıf
// Coğrafya" da görev, süre hedefi ve haftalık takip taşıyabilir.

export const dynamic = 'force-dynamic'

export default async function CoursesPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, status')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()
  if (!student || student.status === 'archived') notFound()

  const data = await loadCoursesData(supabase, { workspaceId, studentId })
  const active = data.courses.filter((c) => c.active)
  const passive = data.courses.filter((c) => !c.active)
  const groups = groupCourses(active)
  const base = `/teacher/students/${studentId}/dersler`

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Dersler"
        subtitle="Öğrencinin tüm aktif dersleri — kaynağı olmasa bile görev ve süre hedefi taşır."
        action={
          <div className="flex flex-wrap gap-2">
            <BulkPasteDialog
              studentId={studentId}
              courses={active.map((c) => ({ id: c.scopeId, name: c.name }))}
            />
            <AddCoursesDialog
              studentId={studentId}
              scopes={data.workspaceScopes.map((s) => ({ id: s.id, name: s.name }))}
              existing={data.courses.filter((c) => c.active).map((c) => c.scopeId)}
            />
          </div>
        }
      />

      {active.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={GraduationCap}
            title="Henüz ders yok"
            description="Öğrencinin okul ve sınav derslerini toplu seçerek ekleyin."
          />
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">{g.label}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.courses.map((c) => {
                const tasks = data.tasks.filter((t) => t.scopeId === c.scopeId && t.status !== 'closed')
                return (
                  <li key={c.scopeId}>
                    <Link
                      href={`${base}/${c.scopeId}`}
                      className="block rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
                    >
                      <p className="font-medium">{c.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {courseSummaryLine(data.resourceCount.get(c.scopeId) ?? 0, tasks)}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      {passive.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Pasif dersler</h2>
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {passive.map((c) => (
              <li key={c.scopeId} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="text-muted-foreground">{c.name}</span>
                <CourseActiveToggle studentId={studentId} scopeId={c.scopeId} active={false} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
