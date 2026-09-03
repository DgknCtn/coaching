import { describe, expect, it } from 'vitest'
import {
  INVITE_TTL_MS,
  deriveInviteStatus,
  inviteTimeLeftLabel,
  isInviteShareable,
} from '@/lib/invite-status'

// Davet yaşam döngüsü kabulleri.
//
// Kritik nokta: veritabanında 'expired' statüsünü yazan tek yer
// accept_invitation'dır ve o da ancak biri linki açmayı denediğinde
// çalışır. Yani süresi dolmuş davetler tabloda 'pending' durur ve
// arayüzün bunu kendi başına anlaması gerekir.

const NOW = new Date('2026-09-03T12:00:00Z')

function row(status: string, expiresAt: string) {
  return { status, expiresAt }
}

describe('deriveInviteStatus', () => {
  it('süresi dolmamış pending davet aktiftir', () => {
    expect(deriveInviteStatus(row('pending', '2026-09-04T12:00:00Z'), NOW)).toBe('active')
  })

  it('süresi dolmuş pending davet expired görünür (DB hâlâ pending der)', () => {
    expect(deriveInviteStatus(row('pending', '2026-09-02T12:00:00Z'), NOW)).toBe('expired')
  })

  it('tam expires_at anı artık geçersizdir', () => {
    // DB kontrolü de `expires_at > NOW()`; iki taraf aynı sınırı kullanmalı.
    expect(deriveInviteStatus(row('pending', '2026-09-03T12:00:00Z'), NOW)).toBe('expired')
    expect(deriveInviteStatus(row('pending', '2026-09-03T12:00:01Z'), NOW)).toBe('active')
  })

  it('kabul edilmiş davet süresi dolmuş olsa da kabul edilmiş kalır', () => {
    expect(deriveInviteStatus(row('accepted', '2026-08-01T00:00:00Z'), NOW)).toBe('accepted')
  })

  it('iptal edilmiş davet süresi dolmamış olsa da iptal kalır', () => {
    expect(deriveInviteStatus(row('revoked', '2026-12-01T00:00:00Z'), NOW)).toBe('revoked')
  })

  it('okunamayan tarih ölü sayılır', () => {
    expect(deriveInviteStatus(row('pending', 'bozuk'), NOW)).toBe('expired')
  })
})

describe('inviteTimeLeftLabel', () => {
  it('gün, saat ve dakikayı uygun eşikte gösterir', () => {
    expect(inviteTimeLeftLabel('2026-09-05T12:00:00Z', NOW)).toBe('2 gün kaldı')
    expect(inviteTimeLeftLabel('2026-09-03T17:00:00Z', NOW)).toBe('5 saat kaldı')
    expect(inviteTimeLeftLabel('2026-09-03T12:12:00Z', NOW)).toBe('12 dakika kaldı')
  })

  it('gün eşiğinin altında hiçbir zaman "0 gün" demez', () => {
    // 48 saatlik veli davetinin son gününde etiket saate düşmeli.
    expect(inviteTimeLeftLabel('2026-09-04T11:00:00Z', NOW)).toBe('23 saat kaldı')
    expect(inviteTimeLeftLabel('2026-09-04T12:00:00Z', NOW)).toBe('1 gün kaldı')
  })

  it('geçmiş tarihte süre bitti der', () => {
    expect(inviteTimeLeftLabel('2026-09-01T00:00:00Z', NOW)).toBe('Süresi doldu')
  })

  it('bir dakikadan az kalınca sıfır yazmaz', () => {
    expect(inviteTimeLeftLabel('2026-09-03T12:00:30Z', NOW)).toBe('1 dakika kaldı')
  })
})

describe('isInviteShareable', () => {
  it('yalnız aktif davetin linki paylaşılabilir', () => {
    expect(isInviteShareable(row('pending', '2026-09-04T12:00:00Z'), NOW)).toBe(true)
    expect(isInviteShareable(row('pending', '2026-09-02T12:00:00Z'), NOW)).toBe(false)
    expect(isInviteShareable(row('accepted', '2026-09-04T12:00:00Z'), NOW)).toBe(false)
    expect(isInviteShareable(row('revoked', '2026-09-04T12:00:00Z'), NOW)).toBe(false)
  })
})

describe('INVITE_TTL_MS', () => {
  // Veli daveti çoğu zaman e-postaya bağlı değil; tek koruma pencere.
  it('veli daveti öğrenci davetinden kısadır', () => {
    expect(INVITE_TTL_MS.parent).toBeLessThan(INVITE_TTL_MS.student)
    expect(INVITE_TTL_MS.parent).toBe(48 * 60 * 60 * 1000)
    expect(INVITE_TTL_MS.student).toBe(7 * 24 * 60 * 60 * 1000)
  })
})
