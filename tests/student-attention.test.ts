import { describe, expect, it } from 'vitest'
import {
  describeStudentAttention,
  formatRelativeTime,
  moodLabel,
} from '@/lib/student-attention'

const HOUR = 3_600_000

describe('describeStudentAttention', () => {
  it('hiçbir aksiyon gerekmiyorsa öğrenciyi etiketlemez', () => {
    expect(describeStudentAttention({})).toEqual({ label: 'İşlem yok', tone: 'none' })
    expect(
      describeStudentAttention({ overdue: 0, pending_approval: 0, pending_check_in_since: null })
    ).toEqual({ label: 'İşlem yok', tone: 'none' })
  })

  it('kayıp temas her şeyin önünde gelir', () => {
    const result = describeStudentAttention({
      pending_check_in_since: new Date(Date.now() - 26 * HOUR).toISOString(),
      overdue: 4,
      pending_approval: 2,
    })
    expect(result).toEqual({ label: '24 saattir bildirim yok', tone: 'attention' })
  })

  it('iki günü aşan sessizliği gün cinsinden söyler', () => {
    const result = describeStudentAttention({
      pending_check_in_since: new Date(Date.now() - 50 * HOUR).toISOString(),
    })
    expect(result.label).toBe('2 gündür bildirim yok')
  })

  it('geciken çalışma onay kuyruğundan önce gelir', () => {
    expect(describeStudentAttention({ overdue: 3, pending_approval: 5 })).toEqual({
      label: '3 geciken çalışma',
      tone: 'attention',
    })
  })

  it('yalnızca onay kuyruğu varsa daha yumuşak tonda bildirir', () => {
    expect(describeStudentAttention({ pending_approval: 2 })).toEqual({
      label: '2 onay bekliyor',
      tone: 'warning',
    })
  })

  it('"iyi / kötü / riskli" gibi genel hüküm üretmez', () => {
    const labels = [
      describeStudentAttention({}),
      describeStudentAttention({ overdue: 1 }),
      describeStudentAttention({ pending_approval: 1 }),
    ].map((r) => r.label.toLocaleLowerCase('tr'))

    for (const label of labels) {
      expect(label).not.toMatch(/riskli|iyi|kötü/)
    }
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-18T12:00:00Z').getTime()

  it('hiç temas yoksa "Hiç" der', () => {
    expect(formatRelativeTime(null, now)).toBe('Hiç')
  })

  it('saat ve gün eşiklerini doğru seçer', () => {
    expect(formatRelativeTime('2026-08-18T11:30:00Z', now)).toBe('30 dk önce')
    expect(formatRelativeTime('2026-08-18T09:00:00Z', now)).toBe('3 saat önce')
    expect(formatRelativeTime('2026-08-16T12:00:00Z', now)).toBe('2 gün önce')
  })
})

describe('moodLabel', () => {
  it('bilinen ruh hâllerini Türkçeleştirir, bilinmeyeni olduğu gibi bırakır', () => {
    expect(moodLabel('zorlaniyorum')).toBe('Zorlanıyorum')
    expect(moodLabel(null)).toBe('—')
    expect(moodLabel('bilinmeyen')).toBe('bilinmeyen')
  })
})
