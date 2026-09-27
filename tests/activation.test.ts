import { describe, it, expect } from 'vitest'
import { activationFunnel, formatHours, lastReachedStep, type ActivationRow } from '@/lib/activation'

const base = '2026-09-01T10:00:00Z'
const at = (h: number) => new Date(new Date(base).getTime() + h * 3_600_000).toISOString()

function row(p: Partial<ActivationRow>): ActivationRow {
  return {
    workspace_id: Math.random().toString(),
    workspace_name: 'X',
    created_at: base,
    first_student_at: null,
    first_assignment_at: null,
    first_homework_at: null,
    first_approval_at: null,
    first_join_at: null,
    ...p,
  }
}

describe('activationFunnel', () => {
  it('huni sayıları, oranlar ve ortanca süre', () => {
    const rows = [
      row({ first_student_at: at(1), first_assignment_at: at(2), first_homework_at: at(3) }),
      row({ first_student_at: at(3) }),
      row({}),
      row({ first_student_at: at(5) }),
    ]
    const f = activationFunnel(rows)
    expect(f[0]).toMatchObject({ key: 'created', reached: 4, percent: 100 })
    const student = f.find((s) => s.key === 'first_student_at')!
    expect(student).toMatchObject({ reached: 3, percent: 75, medianHours: 3 })
    const homework = f.find((s) => s.key === 'first_homework_at')!
    expect(homework).toMatchObject({ reached: 1, percent: 25, medianHours: 3 })
    expect(f.find((s) => s.key === 'first_approval_at')!.medianHours).toBeNull()
  })

  it('boş liste sıfırlarla döner, bölme hatası yok', () => {
    const f = activationFunnel([])
    expect(f.every((s) => s.reached === 0 && s.percent === 0)).toBe(true)
  })

  it('açılıştan önceki kayıt süreyi negatif yapmaz', () => {
    const f = activationFunnel([row({ first_student_at: at(-5) })])
    expect(f.find((s) => s.key === 'first_student_at')!.medianHours).toBe(0)
  })
})

describe('yardımcılar', () => {
  it('formatHours', () => {
    expect(formatHours(null)).toBe('—')
    expect(formatHours(0.2)).toBe('< 1 sa')
    expect(formatHours(5)).toBe('5 sa')
    expect(formatHours(72)).toBe('3 gün')
  })

  it('lastReachedStep sıradaki ilk boşlukta durur', () => {
    expect(lastReachedStep(row({}))).toBe('Alan açıldı')
    expect(lastReachedStep(row({ first_student_at: at(1), first_homework_at: at(2) }))).toBe(
      'İlk öğrenci'
    )
  })
})
