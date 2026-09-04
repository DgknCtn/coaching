import { describe, expect, it } from 'vitest'
import {
  resolveActiveWorkspaceId,
  rolesInWorkspace,
  type WorkspaceMembership,
} from '@/lib/active-workspace'

// Aktif workspace çözümlemesi (Faz 3).
//
// Bu fonksiyon çok kiracılığın kilit noktası. Yanlış çözerse iki şeyden
// biri olur: kullanıcı hiçbir yere giremez, ya da başka bir kiracının
// bağlamına düşer. İkincisi RLS tarafından ayrıca engellenir ama arayüz
// yine de bozulur.
//
// ÇEREZ GÜVENİLMEZDİR: testlerin çoğu "kullanıcı çereze başka bir
// workspace yazarsa ne olur?" sorusunu kovalıyor.

const m = (workspaceId: string, role = 'teacher'): WorkspaceMembership => ({
  workspaceId,
  role,
})

describe('resolveActiveWorkspaceId', () => {
  const memberships = [m('a'), m('b')]

  it('çerezdeki tercih üyelik varsa kazanır', () => {
    expect(resolveActiveWorkspaceId(memberships, 'b', 'a')).toBe('b')
  })

  it('tercih yoksa profilin varsayılanına düşer', () => {
    expect(resolveActiveWorkspaceId(memberships, null, 'a')).toBe('a')
  })

  it('ÇEREZ UYDURMA bir workspace gösteriyorsa yok sayılır', () => {
    // Kullanıcı çerezi elle değiştirdiğinde bağlam kaymamalı.
    expect(resolveActiveWorkspaceId(memberships, 'baskasinin-workspace-i', 'a')).toBe('a')
  })

  it('üyeliği kalmamış varsayılan da yok sayılır', () => {
    // Kullanıcı o kurumdan çıkarılmışsa default_workspace_id hâlâ eski
    // kurumu gösterir; bu doğrulanmasaydı kullanıcı hiçbir yere giremezdi.
    expect(resolveActiveWorkspaceId(memberships, null, 'artik-uye-degil')).toBe('a')
  })

  it('ikisi de geçersizse ilk üyeliğe düşer', () => {
    expect(resolveActiveWorkspaceId(memberships, 'yok', 'yok-da')).toBe('a')
  })

  it('hiç üyelik yoksa null döner', () => {
    expect(resolveActiveWorkspaceId([], 'a', 'b')).toBeNull()
  })

  it('tek üyelikte her zaman o seçilir', () => {
    const tek = [m('solo')]
    expect(resolveActiveWorkspaceId(tek, null, null)).toBe('solo')
    expect(resolveActiveWorkspaceId(tek, 'baska', 'baska')).toBe('solo')
  })
})

describe('rolesInWorkspace', () => {
  it('aynı workspace içindeki tüm rolleri toplar', () => {
    // Kayıt akışı owner + teacher olarak iki satır yazıyor.
    const memberships = [m('a', 'owner'), m('a', 'teacher'), m('b', 'teacher')]
    expect(rolesInWorkspace(memberships, 'a').sort()).toEqual(['owner', 'teacher'])
  })

  it('başka workspace rollerini sızdırmaz', () => {
    const memberships = [m('a', 'owner'), m('b', 'student')]
    expect(rolesInWorkspace(memberships, 'a')).toEqual(['owner'])
  })

  it('workspace yoksa boş döner', () => {
    expect(rolesInWorkspace([m('a')], null)).toEqual([])
  })
})
