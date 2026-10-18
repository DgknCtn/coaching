import type { AcademicTask } from '@/lib/academic-tasks'
import { followUpSummary, weekTasks } from '@/lib/weekly-follow-up'
import { TeacherTaskList } from '@/components/academic/teacher-task-list'

// HAFTALIK TAKİP ÖZETİ (M1.0-03 §9) — Haftalık Akış'ın en üstünde.
// Öğretmen "Bu hafta ne yaptın?" diye sıfırdan bilgi toplamaz; açık
// ekrandan konuşur. Öğrencinin kendi eklediği görev buradan takibe alınır.

export function FollowUpSummary({
  studentId,
  tasks,
  flowId,
  books,
}: {
  studentId: string
  tasks: AcademicTask[]
  flowId: string
  books: { delivered: number; total: number }
}) {
  const s = followUpSummary({ tasks, flowId, books })
  const own = weekTasks(tasks, flowId).filter((t) => t.createdByRole === 'student')
  const open = weekTasks(tasks, flowId).filter((t) => t.createdByRole === 'teacher' && t.status === 'open')

  const stats: { label: string; value: string }[] = [
    { label: 'Öğretmenin görevleri', value: `${s.teacherTasks.done}/${s.teacherTasks.total}` },
    { label: 'Kitap çalışmaları', value: `${s.books.delivered} / ${s.books.total}` },
    ...s.timeTargets.map((x) => ({ label: `Süre · ${x.scopeName}`, value: `${x.done} / ${x.target} dk` })),
    {
      label: 'Öğrencinin kendi ekledikleri',
      value: `${s.ownTasks.total} görev · ${s.ownTasks.done} tamamlandı`,
    },
    { label: 'Tarihsiz açık', value: String(s.undatedOpen) },
    { label: 'Önceki haftadan açık', value: String(s.carriedOpen) },
  ]

  return (
    <section className="rounded-xl border bg-card p-4" aria-label="Haftalık takip özeti">
      <h2 className="text-sm font-semibold">Haftalık Takip Özeti</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((x) => (
          <div key={x.label} className="flex items-baseline justify-between gap-3 border-b pb-1.5 text-sm">
            <dt className="text-muted-foreground">{x.label}</dt>
            <dd className="font-medium tabular-nums">{x.value}</dd>
          </div>
        ))}
      </dl>

      {s.byCourse.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground">Ders bazlı kırılım</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {s.byCourse.map((c) => (
              <li key={c.scopeName} className="flex justify-between gap-2 text-xs">
                <span>{c.scopeName}</span>
                <span className="tabular-nums text-muted-foreground">
                  {c.done}/{c.total}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {(own.length > 0 || open.length > 0) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {open.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">Açık görevler</h3>
              <TeacherTaskList studentId={studentId} tasks={open} showCourse />
            </div>
          )}
          {own.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">Öğrencinin kendi ekledikleri</h3>
              <TeacherTaskList studentId={studentId} tasks={own} showCourse />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
