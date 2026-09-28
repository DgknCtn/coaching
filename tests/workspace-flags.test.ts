import { describe, it, expect } from 'vitest'
import { workspaceFlags, type WorkspaceFlagInput } from '@/lib/admin/workspace-flags'

const NOW = Date.parse('2026-09-28T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()
const daysAhead = (n: number) => new Date(NOW + n * 86_400_000).toISOString()

const base: WorkspaceFlagInput = {
  status: 'active',
  plan: 'licensed',
  created_at: daysAgo(60),
  trial_ends_at: null,
  license_ends_at: daysAhead(90),
  active_students: 5,
  student_limit: 10,
  teacher_last_login_at: daysAgo(1),
  homework_7d: 3,
}

const texts = (w: Partial<WorkspaceFlagInput>) => workspaceFlags({ ...base, ...w }, NOW).map((f) => f.text)

describe('müşteri durum etiketleri', () => {
  it('sağlıklı alanda etiket yok', () => {
    expect(texts({})).toEqual([])
  })

  it('askıdaki alanda etiket üretilmez', () => {
    expect(texts({ status: 'suspended', teacher_last_login_at: null })).toEqual([])
  })

  it('bitişe 7 gün ve daha az kala; 3 gün ve altı kırmızı', () => {
    expect(texts({ license_ends_at: daysAhead(8) })).toEqual([])
    expect(texts({ license_ends_at: daysAhead(6.5) })).toEqual(['Plan 7 gün içinde bitiyor'])
    const f = workspaceFlags({ ...base, plan: 'trial', trial_ends_at: daysAhead(2) }, NOW)
    expect(f).toEqual([{ tone: 'destructive', text: 'Deneme 2 gün içinde bitiyor' }])
  })

  it('bitmiş plan etiket değil (Bitiş sütunu "Doldu" diyor)', () => {
    expect(texts({ license_ends_at: daysAgo(1) })).toEqual([])
  })

  it('7 gündür giriş yok — yeni alanlarda değil', () => {
    expect(texts({ teacher_last_login_at: daysAgo(8) })).toContain('7 gündür öğretmen girişi yok')
    expect(texts({ teacher_last_login_at: null })).toContain('7 gündür öğretmen girişi yok')
    expect(texts({ teacher_last_login_at: null, created_at: daysAgo(2) })).toEqual([])
  })

  it('öğrencisi olup ödev vermeyen; öğrencisiz alanda değil', () => {
    expect(texts({ homework_7d: 0 })).toEqual(['Son 7 günde ödev verilmedi'])
    expect(texts({ homework_7d: 0, active_students: 0 })).toEqual([])
  })

  it('öğrenci limiti', () => {
    expect(texts({ active_students: 10 })).toEqual(['Öğrenci limitine ulaştı'])
    expect(texts({ student_limit: null, active_students: 999 })).toEqual([])
  })
})
