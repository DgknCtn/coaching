// HAFTALIK AKADEMİK TAKİP ÖZETİ (M1.0-03 §9).
//
// Öğretmen 25 dakikalık takip görüşmesine görev görev dolaşarak değil,
// bu kısa özetle girer: "Matematik iyi; Fizik hedefinde eksik var; Geo
// görevi önceki haftadan açık; öğrenci kendi kendine Coğrafya görevi
// eklemiş."
//
// SAF modül. Kitap sayıları Haftalık Akış'ın mevcut teslim sayımından
// gelir (iki ayrı sayım yazılmaz); görevler 148'den.

import type { AcademicTask } from '@/lib/academic-tasks'

export interface FollowUpSummary {
  teacherTasks: { done: number; total: number }
  books: { delivered: number; total: number }
  timeTargets: { scopeName: string; done: number; target: number }[]
  ownTasks: { total: number; done: number; tracked: number }
  undatedOpen: number
  carriedOpen: number
  byCourse: { scopeName: string; done: number; total: number }[]
}

/**
 * Haftanın görevleri: bu haftaya bağlı olanlar + hangi haftadan gelirse
 * gelsin hâlâ açık olanlar. Taslak ve kapatılanlar sayılmaz.
 */
export function weekTasks(tasks: AcademicTask[], flowId: string): AcademicTask[] {
  return tasks.filter(
    (t) => (t.status === 'open' || t.status === 'done') && (t.weeklyFlowId === flowId || t.status === 'open')
  )
}

export function followUpSummary(input: {
  tasks: AcademicTask[]
  flowId: string
  books: { delivered: number; total: number }
}): FollowUpSummary {
  const week = weekTasks(input.tasks, input.flowId)
  const isDone = (t: AcademicTask) => t.status === 'done'
  const teacher = week.filter((t) => t.createdByRole === 'teacher' && t.kind !== 'sure')
  const own = week.filter((t) => t.createdByRole === 'student')

  const byCourse = new Map<string, { scopeName: string; done: number; total: number }>()
  for (const t of week.filter((x) => x.kind !== 'sure')) {
    const row = byCourse.get(t.scopeId) ?? { scopeName: t.scopeName, done: 0, total: 0 }
    row.total++
    if (isDone(t)) row.done++
    byCourse.set(t.scopeId, row)
  }

  return {
    teacherTasks: { done: teacher.filter(isDone).length, total: teacher.length },
    books: input.books,
    timeTargets: week
      .filter((t) => t.kind === 'sure')
      .map((t) => ({ scopeName: t.scopeName, done: t.doneMinutes, target: t.targetMinutes ?? 0 })),
    ownTasks: { total: own.length, done: own.filter(isDone).length, tracked: own.filter((t) => t.tracked).length },
    undatedOpen: week.filter((t) => t.status === 'open' && t.undated && t.createdByRole === 'teacher').length,
    carriedOpen: week.filter(
      (t) => t.status === 'open' && (t.originFlowId ?? t.weeklyFlowId) !== input.flowId
    ).length,
    byCourse: [...byCourse.values()].sort((a, b) => a.scopeName.localeCompare(b.scopeName, 'tr')),
  }
}
