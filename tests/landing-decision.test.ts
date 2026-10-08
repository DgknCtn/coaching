import { describe, it, expect } from 'vitest'
import { decideLanding, hasTeacherIntent, panelForRole } from '@/lib/landing-decision'

// Oturumu olan kullanıcının "/" adresindeki kararı (116 ile birlikte).
// Önceden alanı olmayan HERKES öğretmen yapılıyordu; davetli öğrenci
// Google ile /login'den girince kendi öğretmen alanını açıyordu.

describe('decideLanding', () => {
  it('profil okunamadıysa karar verilmez', () => {
    expect(decideLanding({ profileError: true, hasWorkspace: false, metadata: null })).toBe(
      'access-error'
    )
  })

  it('alanı olan kullanıcı rolüne göre yönlenir — niyet bakılmaz', () => {
    expect(
      decideLanding({ profileError: false, hasWorkspace: true, metadata: { signup_intent: 'teacher' } })
    ).toBe('route-by-role')
    expect(decideLanding({ profileError: false, hasWorkspace: true, metadata: null })).toBe(
      'route-by-role'
    )
  })

  it('kayıt formundan gelen öğretmen alanını kurar', () => {
    expect(
      decideLanding({ profileError: false, hasWorkspace: false, metadata: { signup_intent: 'teacher' } })
    ).toBe('setup-teacher')
  })

  it('niyet alanı eklenmeden önce kayıt olup doğrulama bekleyen öğretmen de tanınır', () => {
    expect(
      decideLanding({
        profileError: false,
        hasWorkspace: false,
        metadata: { full_name: 'X', workspace_name: null, partner_code: null },
      })
    ).toBe('setup-teacher')
  })

  it('Google ile /login üstünden gelen, alanı olmayan kullanıcı ÖĞRETMEN YAPILMAZ', () => {
    // Google üst verisi: full_name, name, avatar_url… workspace_name YOK.
    const googleMeta = { full_name: 'Ayşe Y.', name: 'Ayşe Y.', avatar_url: 'https://x' }
    expect(hasTeacherIntent(googleMeta)).toBe(false)
    expect(decideLanding({ profileError: false, hasWorkspace: false, metadata: googleMeta })).toBe(
      'welcome'
    )
  })

  it('alanını "yanlışlıkla açtım" diye kapatan kullanıcı yeniden öğretmen yapılmaz (138)', () => {
    // Üst veride workspace_name anahtarı kalır (Supabase anahtar silemez).
    const closedMeta = { signup_intent: 'member', workspace_name: null, full_name: 'X' }
    expect(hasTeacherIntent(closedMeta)).toBe(false)
    expect(decideLanding({ profileError: false, hasWorkspace: false, metadata: closedMeta })).toBe(
      'welcome'
    )
  })
})

describe('panelForRole', () => {
  it('davetin rolüne ait panel', () => {
    expect(panelForRole('student')).toBe('/student')
    expect(panelForRole('parent')).toBe('/parent')
    expect(panelForRole('teacher')).toBe('/teacher')
    expect(panelForRole('owner')).toBe('/teacher')
    expect(panelForRole(undefined)).toBe('/')
  })
})
