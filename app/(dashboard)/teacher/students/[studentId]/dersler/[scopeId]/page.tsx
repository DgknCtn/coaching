import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { loadBookMap } from '@/lib/book-map'
import { bookPlanStatusLabel, bookRoleLabel } from '@/lib/resource-plan'
import { courseSummaryLine } from '@/lib/academic-tasks'
import { PageHeader } from '@/components/shared/page-header'
import { LinkTabs } from '@/components/shared/link-tabs'
import { Section } from '@/components/shared/section'
import { ProgressBar } from '@/components/shared/progress-bar'
import { QuickTaskInput } from '@/components/academic/quick-task-input'
import { TeacherTaskList } from '@/components/academic/teacher-task-list'
import { loadCoursesData } from '../load'
import { CourseActiveToggle } from '../courses-client'

// DERS DETAYI (M1.0-03 §2) — V1'de iki sekme: Görevler (kitap dışı iş,
// süre hedefleri) ve Kaynaklar (mevcut kaynak planı + kitap ilerlemesi).
// Ders zaten bilindiği için görev eklerken ders sorulmaz.

export const dynamic = 'force-dynamic'

export default async function CourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string; scopeId: string }>
  searchParams: Promise<{ sekme?: string }>
}) {
  const { studentId, scopeId } = await params
  const { sekme } = await searchParams
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, status')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()
  if (!student || student.status === 'archived') notFound()

  const data = await loadCoursesData(supabase, { workspaceId, studentId })
  const course = data.courses.find((c) => c.scopeId === scopeId)
  if (!course) notFound()

  const tab = sekme === 'kaynaklar' ? 'kaynaklar' : 'gorevler'
  const base = `/teacher/students/${studentId}/dersler/${scopeId}`
  const tasks = data.tasks.filter((t) => t.scopeId === scopeId)
  const visible = tasks.filter((t) => t.status !== 'closed')
  const books =
    tab === 'kaynaklar'
      ? (
          await loadBookMap(supabase, {
            workspaceId,
            studentId,
            statuses: ['active', 'pending', 'paused', 'completed'],
          })
        ).filter((b) => b.scopeId === scopeId)
      : []

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        title={course.name}
        subtitle={courseSummaryLine(data.resourceCount.get(scopeId) ?? 0, visible)}
        backHref={`/teacher/students/${studentId}/dersler`}
        action={<CourseActiveToggle studentId={studentId} scopeId={scopeId} active={course.active} />}
      />

      <LinkTabs
        ariaLabel="Ders sekmeleri"
        activeKey={tab}
        tabs={[
          { key: 'gorevler', label: 'Görevler', href: base, count: visible.length },
          {
            key: 'kaynaklar',
            label: 'Kaynaklar',
            href: `${base}?sekme=kaynaklar`,
            count: data.resourceCount.get(scopeId) ?? 0,
          },
        ]}
      />

      {tab === 'gorevler' ? (
        <div className="space-y-5">
          {course.active ? (
            <QuickTaskInput studentId={studentId} scopeId={scopeId} planPublished={data.planPublished} />
          ) : (
            <p className="text-sm text-muted-foreground">Ders pasif; görev eklemek için yeniden açın.</p>
          )}
          <Section title="Taslak plan" description="Planı Yayınla ile öğrencinin haftasına düşer." variant="card">
            <TeacherTaskList
              studentId={studentId}
              tasks={visible.filter((t) => t.status === 'draft')}
              emptyText="Sepette bu derse ait görev yok."
            />
          </Section>
          <Section title="Öğrencinin haftasında" variant="card">
            <TeacherTaskList
              studentId={studentId}
              tasks={visible.filter((t) => t.status === 'open' || t.status === 'done')}
              emptyText="Yayınlanmış görev yok."
            />
          </Section>
          {tasks.some((t) => t.status === 'closed') && (
            <Section title="Kapatılanlar" variant="card">
              <TeacherTaskList studentId={studentId} tasks={tasks.filter((t) => t.status === 'closed')} />
            </Section>
          )}
        </div>
      ) : (
        <Section
          title="Kaynaklar"
          description="Rol, tempo ve plan durumu Kaynak Planı'nda."
          action={
            <Link href={`/teacher/students/${studentId}/goals`} className="text-sm text-primary hover:underline">
              Kaynak Planı&apos;nı aç
            </Link>
          }
          variant="card"
        >
          {books.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bu derse atanmış kaynak yok. 0 kaynak boş ders demek değildir.</p>
          ) : (
            <ul className="divide-y text-sm">
              {books.map((b) => {
                const pct = b.totalTests > 0 ? Math.round((b.completedTests / b.totalTests) * 100) : 0
                return (
                  <li key={b.assignmentId} className="flex items-center justify-between gap-4 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/teacher/students/${studentId}/books/${b.bookId}`}
                        className="truncate font-medium hover:underline"
                      >
                        {b.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {bookPlanStatusLabel(b.status)}
                        {b.role ? ` · ${bookRoleLabel(b.role)}` : ''}
                      </p>
                    </div>
                    <div className="w-32 shrink-0">
                      <ProgressBar value={pct} />
                      <p className="mt-0.5 text-right text-xs tabular-nums text-muted-foreground">
                        {b.completedTests}/{b.totalTests}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      )}
    </div>
  )
}
