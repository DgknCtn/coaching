import { describe, it, expect } from 'vitest'
import { authErrorToTr, inviteErrorToTr } from '@/lib/auth-errors'

describe('authErrorToTr', () => {
  it('maps invalid credentials', () => {
    expect(authErrorToTr('Invalid login credentials')).toBe('E-posta veya şifre hatalı.')
  })

  it('maps unconfirmed email', () => {
    expect(authErrorToTr('Email not confirmed')).toBe('E-posta adresiniz henüz doğrulanmamış.')
  })

  it('maps already-registered user', () => {
    expect(authErrorToTr('User already registered')).toBe('Bu e-posta ile zaten bir hesap mevcut.')
  })

  it('maps rate limiting', () => {
    expect(authErrorToTr('Email rate limit exceeded')).toBe(
      'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.'
    )
  })

  it('never leaks unknown raw messages', () => {
    const raw = 'duplicate key value violates unique constraint "profiles_pkey"'
    expect(authErrorToTr(raw)).toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.')
    expect(authErrorToTr(raw)).not.toContain('constraint')
  })
})

describe('inviteErrorToTr', () => {
  it('maps used/invalid invitation', () => {
    expect(inviteErrorToTr('Invalid or already used invitation')).toBe(
      'Bu davet geçersiz veya zaten kullanılmış.'
    )
  })

  it('maps expired invitation', () => {
    expect(inviteErrorToTr('Invitation has expired')).toBe('Bu davetin süresi dolmuş.')
  })

  it('maps wrong-email invitation', () => {
    expect(inviteErrorToTr('This invitation was issued for a different email address')).toBe(
      'Bu davet farklı bir e-posta adresi için oluşturulmuş.'
    )
  })

  it('never leaks unknown raw messages', () => {
    expect(inviteErrorToTr('null value in column "x"')).toBe('Davet kabul edilemedi. Lütfen tekrar deneyin.')
  })
})
