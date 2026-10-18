import { describe, expect, it } from 'vitest'
import { followUpSummary } from '@/lib/weekly-follow-up'
import type { AcademicTask } from '@/lib/academic-tasks'

// M1.0-03 §9 — belgedeki örnek özet: Öğretmenin görevleri 4/6, Kitap
// 21/31, Fizik 85/120 dk, kendi ekledikleri 3 görev · 2 tamamlandı,
// tarihsiz açık 2, önceki haftadan açık 1.

const W = 'flow-now'
const OLD = 'flow-old'
let n = 0
const t = (p: Partial<AcademicTask>): AcademicTask => ({
  id: `t${n++}`,
  studentId: 's',
  scopeId: 'mat',
  scopeName: 'Matematik',
  kind: 'gorev',
  title: 'x',
  targetMinutes: null,
  doneMinutes: 0,
  createdByRole: 'teacher',
  tracked: false,
  status: 'open',
  dueAt: null,
  undated: false,
  weeklyFlowId: W,
  originFlowId: W,
  plannedForDate: null,
  completedAt: null,
  checklist: [],
  ...p,
})

describe('Haftalık takip özeti', () => {
  const tasks = [
    // Öğretmenin 6 görevi, 4'ü tamam
    t({ status: 'done' }),
    t({ status: 'done' }),
    t({ status: 'done' }),
    t({ status: 'done', scopeId: 'kim', scopeName: 'Kimya' }),
    t({ undated: true, scopeId: 'geo', scopeName: 'AYT Geometri', originFlowId: OLD }),
    t({ undated: true, scopeId: 'tar', scopeName: 'TYT Tarih' }),
    // Süre hedefi
    t({ kind: 'sure', scopeId: 'fiz', scopeName: '11. Sınıf Fizik', targetMinutes: 120, doneMinutes: 85 }),
    // Öğrencinin kendi 3 görevi, 2'si tamam
    t({ createdByRole: 'student', status: 'done', undated: true, scopeName: 'Coğrafya', scopeId: 'cog' }),
    t({ createdByRole: 'student', status: 'done', undated: true, scopeName: 'Coğrafya', scopeId: 'cog' }),
    t({ createdByRole: 'student', undated: true, tracked: true, scopeName: 'Coğrafya', scopeId: 'cog' }),
    // Sayılmayanlar: taslak, kapatılan, eski haftada tamamlanan
    t({ status: 'draft', weeklyFlowId: null }),
    t({ status: 'closed' }),
    t({ status: 'done', weeklyFlowId: OLD, originFlowId: OLD }),
  ]
  const s = followUpSummary({ tasks, flowId: W, books: { delivered: 21, total: 31 } })

  it('belgedeki göstergeler', () => {
    expect(s.teacherTasks).toEqual({ done: 4, total: 6 })
    expect(s.books).toEqual({ delivered: 21, total: 31 })
    expect(s.timeTargets).toEqual([{ scopeName: '11. Sınıf Fizik', done: 85, target: 120 }])
    expect(s.ownTasks).toEqual({ total: 3, done: 2, tracked: 1 })
    expect(s.undatedOpen).toBe(2)
    expect(s.carriedOpen).toBe(1)
  })

  it('ders bazlı kısa kırılım', () => {
    expect(s.byCourse.find((c) => c.scopeName === 'Matematik')).toEqual({ scopeName: 'Matematik', done: 3, total: 3 })
    expect(s.byCourse.find((c) => c.scopeName === 'Coğrafya')).toEqual({ scopeName: 'Coğrafya', done: 2, total: 3 })
  })
})
