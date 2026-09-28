import { describe, it, expect } from 'vitest'
import { calendarDaysBetween, reminderFor, type ReminderWorkspace } from '@/lib/reminders'

// 28 Eylül 2026, 09:00 İstanbul (06:00 UTC) — cron'un çalıştığı saat.
const NOW = new Date('2026-09-28T06:00:00Z')

const trial = (trialEndsAt: string | null, extra: Partial<ReminderWorkspace> = {}): ReminderWorkspace => ({
  workspaceId: 'ws1',
  plan: 'trial',
  status: 'active',
  isLibrary: false,
  trialEndsAt,
  licenseEndsAt: null,
  ...extra,
})

const license = (licenseEndsAt: string): ReminderWorkspace => ({
  workspaceId: 'ws2',
  plan: 'licensed',
  status: 'active',
  isLibrary: false,
  trialEndsAt: null,
  licenseEndsAt,
})

describe('takvim günü', () => {
  it('yarın gece yarısından sonra biten → 1 gün (saat farkı değil)', () => {
    // 29 Eylül 00:30 İstanbul = 28 Eylül 21:30 UTC
    expect(calendarDaysBetween(NOW, new Date('2026-09-28T21:30:00Z'))).toBe(1)
    expect(calendarDaysBetween(NOW, new Date('2026-09-28T20:30:00Z'))).toBe(0)
  })
})

describe('deneme hatırlatması', () => {
  it('eşik dışında sessiz', () => {
    expect(reminderFor(trial('2026-10-05T10:00:00Z'), NOW)).toBeNull()
  })

  it('3 gün ve 2 gün → trial_3; 1 gün ve aynı gün → trial_1', () => {
    expect(reminderFor(trial('2026-10-01T10:00:00Z'), NOW)?.kind).toBe('trial_3')
    expect(reminderFor(trial('2026-09-30T10:00:00Z'), NOW)?.kind).toBe('trial_3')
    expect(reminderFor(trial('2026-09-29T10:00:00Z'), NOW)?.kind).toBe('trial_1')
    expect(reminderFor(trial('2026-09-28T18:00:00Z'), NOW)?.kind).toBe('trial_1')
  })

  it('bitti: ilk 3 gün içinde bir kez, daha eskisi sessiz', () => {
    const r = reminderFor(trial('2026-09-27T10:00:00Z'), NOW)
    expect(r?.kind).toBe('trial_ended')
    expect(r?.daysLeft).toBe(0)
    expect(reminderFor(trial('2026-09-20T10:00:00Z'), NOW)).toBeNull()
  })

  it('tekillik anahtarı bitiş gününü taşır — uzatılınca yeni ileti', () => {
    const a = reminderFor(trial('2026-09-30T10:00:00Z'), NOW)!
    const b = reminderFor(trial('2026-10-01T10:00:00Z'), NOW)!
    expect(a.kind).toBe(b.kind)
    expect(a.dedupeKey).not.toBe(b.dedupeKey)
    expect(a.dedupeKey).toBe('trial_3:ws1:2026-09-30')
  })

  it('askı, arşiv ve kütüphane alanında hatırlatma yok', () => {
    expect(reminderFor(trial('2026-09-29T10:00:00Z', { status: 'suspended' }), NOW)).toBeNull()
    expect(reminderFor(trial('2026-09-29T10:00:00Z', { isLibrary: true }), NOW)).toBeNull()
  })
})

describe('lisans hatırlatması', () => {
  it('7 gün ve 1 gün eşikleri', () => {
    expect(reminderFor(license('2026-10-10T10:00:00Z'), NOW)).toBeNull()
    expect(reminderFor(license('2026-10-05T10:00:00Z'), NOW)?.kind).toBe('license_7')
    expect(reminderFor(license('2026-09-29T10:00:00Z'), NOW)?.kind).toBe('license_1')
    expect(reminderFor(license('2026-09-27T10:00:00Z'), NOW)?.kind).toBe('license_ended')
  })

  it('kurumsal ve bilinmeyen planda yok', () => {
    expect(reminderFor({ ...license('2026-09-29T10:00:00Z'), plan: 'institution' }, NOW)).toBeNull()
  })
})
