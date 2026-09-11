import { describe, expect, it } from 'vitest'
import {
  resolveActiveWorkspaceId,
  resolveActiveWorkspace,
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

describe('resolveActiveWorkspace (gerekçe)', () => {
  const memberships = [m('a'), m('b')]

  // P0 (07 Eylül 2026): öğretmen hiçbir şey silmeden eski veri setini
  // görüyordu. Çözümleme doğru karar veriyor; kusur, yanlış çerezle
  // BAŞKA bir alana düşmenin hiçbir iz bırakmamasıydı. Bu testler
  // gerekçenin dışarı verildiğini sabitliyor.

  it('geçerli tercihte kaynak cookie ve reddedilen tercih yok', () => {
    expect(resolveActiveWorkspace(memberships, 'b', 'a')).toEqual({
      workspaceId: 'b',
      source: 'cookie',
      rejectedPreference: null,
    })
  })

  it('doğrulanamayan tercih rejectedPreference olarak dışarı verilir', () => {
    expect(resolveActiveWorkspace(memberships, 'baskasinin-workspace-i', 'a')).toEqual({
      workspaceId: 'a',
      source: 'default',
      rejectedPreference: 'baskasinin-workspace-i',
    })
  })

  it('tercih HİÇ yoksa sessizce varsayılana düşmek normaldir', () => {
    // Çerezsiz ilk giriş. Burada uyarılacak bir şey yok.
    expect(resolveActiveWorkspace(memberships, null, 'a')).toEqual({
      workspaceId: 'a',
      source: 'default',
      rejectedPreference: null,
    })
  })

  it('varsayılan da tutmazsa ilk üyeliğe düşer ve bunu söyler', () => {
    expect(resolveActiveWorkspace(memberships, 'yok', 'yok-da')).toEqual({
      workspaceId: 'a',
      source: 'first',
      rejectedPreference: 'yok',
    })
  })

  it('hiç üyelik yoksa source none', () => {
    expect(resolveActiveWorkspace([], 'a', 'b')).toEqual({
      workspaceId: null,
      source: 'none',
      rejectedPreference: 'a',
    })
  })

  it('id döndüren sürümle her zaman aynı sonucu verir', () => {
    // İki fonksiyon ayrı kopyalara ayrılırsa kural sessizce çatallanır.
    const cases: [string | null, string | null][] = [
      ['b', 'a'],
      [null, 'a'],
      ['yok', 'a'],
      ['yok', 'yok-da'],
      [null, null],
    ]
    for (const [pref, def] of cases) {
      expect(resolveActiveWorkspace(memberships, pref, def).workspaceId).toBe(
        resolveActiveWorkspaceId(memberships, pref, def)
      )
    }
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
