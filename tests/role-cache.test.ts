import { describe, it, expect } from 'vitest'
import {
  ROLE_CACHE_MAX_AGE_SECONDS,
  parseRoleCache,
  serializeRoleCache,
} from '@/lib/role-cache'

const NOW = 1_700_000_000
const SUB = 'auth-user-1'

function cookie(overrides: Partial<Parameters<typeof serializeRoleCache>[0]> = {}) {
  return serializeRoleCache({
    sub: SUB,
    workspaceId: 'ws-1',
    roles: ['owner'],
    exp: NOW + ROLE_CACHE_MAX_AGE_SECONDS,
    ...overrides,
  })
}

describe('rol önbelleği · çerez çözümleme', () => {
  it('geçerli çerezi çözer', () => {
    expect(parseRoleCache(cookie(), SUB, 'ws-1', NOW)).toEqual({
      sub: SUB,
      workspaceId: 'ws-1',
      roles: ['owner'],
      exp: NOW + ROLE_CACHE_MAX_AGE_SECONDS,
    })
  })

  it('çerez yoksa null döner', () => {
    expect(parseRoleCache(undefined, SUB, 'ws-1', NOW)).toBeNull()
  })

  it('bozuk JSON null döner — çağıran veritabanına gider', () => {
    expect(parseRoleCache('{bozuk', SUB, 'ws-1', NOW)).toBeNull()
  })

  it('süresi dolmuş çerezi reddeder', () => {
    const raw = cookie({ exp: NOW - 1 })
    expect(parseRoleCache(raw, SUB, 'ws-1', NOW)).toBeNull()
  })

  // BAŞKA KULLANICI: paylaşılan bir tarayıcıda hesap değiştirildiğinde
  // önceki kullanıcının rolleri devralınmamalı.
  it('başka bir kullanıcıya ait çerezi reddeder', () => {
    expect(parseRoleCache(cookie(), 'auth-user-2', 'ws-1', NOW)).toBeNull()
  })

  // ÇALIŞMA ALANI DEĞİŞİMİ: tercih çerezi yeni bir alanı gösteriyorsa
  // önbellekteki roller eski alana aittir; kullanılmamalı.
  it('tercih edilen workspace ile uyuşmayan çerezi reddeder', () => {
    expect(parseRoleCache(cookie(), SUB, 'ws-2', NOW)).toBeNull()
  })

  it('tercih çerezi yokken çözülmüş workspace kabul edilir', () => {
    expect(parseRoleCache(cookie(), SUB, null, NOW)?.roles).toEqual(['owner'])
  })

  it('roller dizi değilse reddeder', () => {
    expect(parseRoleCache('{"sub":"auth-user-1","workspaceId":"ws-1","roles":"owner","exp":9999999999}', SUB, 'ws-1', NOW)).toBeNull()
  })

  // HİÇ ROL YOK, ama bu geçerli bir durum: askıya alınmış çalışma alanının
  // üyelikleri RLS tarafından süzülür. Boş dizi önbelleklenebilmeli.
  it('boş rol listesini geçerli sayar', () => {
    const raw = cookie({ roles: [], workspaceId: null })
    expect(parseRoleCache(raw, SUB, null, NOW)?.roles).toEqual([])
  })
})
