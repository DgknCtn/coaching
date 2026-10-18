import { describe, expect, it } from 'vitest'
import { parsePaste } from '@/lib/academic-paste'
import {
  courseGroupOf,
  courseSummaryLine,
  groupCourses,
  parseQuickTask,
  planSummary,
  taskProgressLabel,
  type AcademicTask,
} from '@/lib/academic-tasks'

// M1.0-03 — Dersler, Akademik Görevler, Toplu Yapıştır (saf kurallar).

const courses = [
  { id: 'fiz', name: '11. Sınıf Fizik' },
  { id: 'kim', name: '11. Sınıf Kimya' },
  { id: 'geo', name: 'AYT Geometri' },
  { id: 'tar', name: 'TYT Tarih' },
]

describe('Toplu Yapıştır (§4) — API/LLM olmadan', () => {
  it('belgedeki dört satır', () => {
    const rows = parsePaste(
      [
        '11. Sınıf Fizik | Sure | 120 dk',
        '11. Sınıf Kimya | Gorev | Yazili kapsamini tekrar et',
        'AYT Geometri | Gorev | Tum formulleri cikar | Tarihsiz',
        'TYT Tarih | Gorev | Metroda el kitabini oku | Tarihsiz',
      ].join('\n'),
      courses
    )
    expect(rows.every((r) => r.ok)).toBe(true)
    const ok = rows.filter((r) => r.ok)
    expect(ok.map((r) => [r.scopeId, r.kind, r.undated])).toEqual([
      ['fiz', 'sure', false],
      ['kim', 'gorev', false],
      ['geo', 'gorev', true],
      ['tar', 'gorev', true],
    ])
    expect(ok[0].targetMinutes).toBe(120)
  })

  it('Türkçe karakter ve büyük/küçük harf farkı ders eşleşmesini bozmaz', () => {
    const [r] = parsePaste('11. SINIF FİZİK | Süre | 90', courses)
    expect(r.ok && r.scopeId).toBe('fiz')
    const [k] = parsePaste('ayt geometrı | GÖREV | x', courses)
    expect(k.ok && k.scopeId).toBe('geo')
  })

  it('tanımsız ders veya tür hata olur, diğer satırlar kaybolmaz', () => {
    const rows = parsePaste(
      ['Felsefe | Gorev | Oku', 'AYT Geometri | Proje | x', 'TYT Tarih | Gorev | Oku', 'yalnız metin'].join('\n'),
      courses
    )
    expect(rows.map((r) => r.ok)).toEqual([false, false, true, false])
    expect(rows[0].ok === false && rows[0].error).toMatch(/aktif dersleri/)
    expect(rows[1].ok === false && rows[1].error).toMatch(/tanınmayan tür/)
  })

  it('süre satırında dakika zorunlu; checklist maddeleri "/" ile', () => {
    const [bad, chk] = parsePaste(
      ['11. Sınıf Fizik | Süre | çok', '11. Sınıf Kimya | Checklist | Yazılı: Redox / Asit-Baz / Çökelme'].join('\n'),
      courses
    )
    expect(bad.ok).toBe(false)
    expect(chk.ok && chk.title).toBe('Yazılı')
    expect(chk.ok && chk.checklist).toEqual(['Redox', 'Asit-Baz', 'Çökelme'])
  })
})

describe('Hızlı görev girişi (§3)', () => {
  it('düz metin görevdir', () => {
    expect(parseQuickTask('Quiz yanlışlarını tekrar et')).toEqual({
      kind: 'gorev',
      title: 'Quiz yanlışlarını tekrar et',
      targetMinutes: null,
      checklist: [],
    })
  })
  it('"120 dk" süre hedefidir', () => {
    const q = parseQuickTask('Bu hafta 120 dk')!
    expect(q.kind).toBe('sure')
    expect(q.targetMinutes).toBe(120)
    expect(q.title).toBe('Bu hafta')
  })
  it('"Başlık: a / b" checklist olur', () => {
    const q = parseQuickTask('Kimya yazılısı: Redox / Asit-Baz')!
    expect(q.kind).toBe('checklist')
    expect(q.checklist).toEqual(['Redox', 'Asit-Baz'])
  })
  it('boş giriş yok sayılır', () => {
    expect(parseQuickTask('   ')).toBeNull()
  })
})

describe('Dersler ekranı (§2)', () => {
  it('varsayılan gruplama: Okul/Sınıf, TYT, AYT', () => {
    expect(courseGroupOf({ name: '11. Sınıf Fizik', levelExam: '11. Sınıf' })).toBe('okul')
    expect(courseGroupOf({ name: 'AYT Geometri', levelExam: null })).toBe('ayt')
    expect(courseGroupOf({ name: 'TYT Biyoloji', levelExam: 'TYT' })).toBe('tyt')
    const groups = groupCourses([
      { name: 'AYT Geometri', levelExam: 'AYT' },
      { name: '11. Sınıf Coğrafya', levelExam: null },
      { name: 'TYT Biyoloji', levelExam: 'TYT' },
    ])
    expect(groups.map((g) => g.key)).toEqual(['okul', 'tyt', 'ayt'])
  })

  const task = (p: Partial<AcademicTask>): AcademicTask => ({
    id: 'x',
    studentId: 's',
    scopeId: 'fiz',
    scopeName: '11. Sınıf Fizik',
    kind: 'gorev',
    title: 't',
    targetMinutes: null,
    doneMinutes: 0,
    createdByRole: 'teacher',
    tracked: false,
    status: 'open',
    dueAt: null,
    undated: false,
    weeklyFlowId: null,
    originFlowId: null,
    plannedForDate: null,
    completedAt: null,
    checklist: [],
    ...p,
  })

  it('0 kaynak boş ders demek değildir', () => {
    expect(
      courseSummaryLine(0, [
        task({ id: 'a' }),
        task({ id: 'b' }),
        task({ id: 'c', kind: 'sure', targetMinutes: 120, doneMinutes: 85 }),
      ])
    ).toBe('0 kaynak · 2 açık görev · 85/120 dk')
    expect(courseSummaryLine(1, [task({ undated: true })])).toBe('1 aktif kaynak · 1 tarihsiz açık görev')
  })

  it('ilerleme etiketi', () => {
    expect(taskProgressLabel(task({ kind: 'sure', targetMinutes: 120, doneMinutes: 85 }))).toBe('85/120 dk')
    expect(
      taskProgressLabel(
        task({
          kind: 'checklist',
          checklist: [
            { id: '1', title: 'a', done: true },
            { id: '2', title: 'b', done: false },
          ],
        })
      )
    ).toBe('1/2')
    expect(taskProgressLabel(task({ undated: true }))).toBe('Tarihsiz')
  })

  it('plan özeti farklı birimleri toplamaz (§5)', () => {
    expect(
      planSummary(31, [task({}), task({}), task({}), task({ kind: 'sure', targetMinutes: 120 })])
    ).toEqual({ bookUnits: 31, taskCount: 3, minutes: 120 })
  })
})
