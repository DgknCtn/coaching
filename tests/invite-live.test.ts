import { describe, it, expect, beforeAll } from 'vitest'
import { canRunTenantTests, signInBothTenants, type Tenant } from './helpers/tenant'

// ============================================================
// DAVET MERKEZLİ GİRİŞ (116) — canlı yetki testleri
//
// `my_pending_invitations` yalnız oturumdaki e-postaya kesilmiş davetleri
// döndürmeli; `accept_invitation_by_id` başkasının davetini kabul
// etmemeli ve e-postasız (bağsız) veli davetini ID ile hiç kabul
// etmemeli. Migration 116 canlıda değilse bu dosya kırmızıdır.
// ============================================================

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

describe.skipIf(!canRunTenantTests)('davet merkezli giriş · canlı', () => {
  let a: Tenant
  let b: Tenant

  beforeAll(async () => {
    const tenants = await signInBothTenants()
    a = tenants.a
    b = tenants.b
  }, 30_000)

  it('my_pending_invitations yalnız kendi e-postama kesilmiş davetleri döndürür', async () => {
    const r = await a.rpc<{ invitation_id: string }[]>('my_pending_invitations', {})
    expect(r.code, JSON.stringify(r.body)).toBeNull()
    expect(Array.isArray(r.body)).toBe(true)

    // Dönen her davetin e-postası A'nınki olmalı: B kendi alanındaki
    // davetleri okuyabiliyor, A'ya dönenlerle kesişmemeli.
    const bInvites = await b.select<{ id: string; invited_email: string | null }[]>(
      'invitations?select=id,invited_email&status=eq.pending'
    )
    const foreign = new Set(
      (bInvites.body ?? [])
        .filter((i) => i.invited_email?.toLowerCase() !== a.email.toLowerCase())
        .map((i) => i.id)
    )
    for (const row of r.body) expect(foreign.has(row.invitation_id)).toBe(false)
  })

  it('accept_invitation_by_id başkasının davetini kabul etmez', async () => {
    const bInvites = await b.select<{ id: string; invited_email: string | null }[]>(
      'invitations?select=id,invited_email&status=eq.pending'
    )
    const target = (bInvites.body ?? []).find(
      (i) => i.invited_email?.toLowerCase() !== a.email.toLowerCase()
    )
    if (!target) return // B'de bekleyen yabancı davet yok — iddia edilecek bir şey yok.

    const r = await a.rpc('accept_invitation_by_id', {
      p_invitation_id: target.id,
      p_full_name: 'Test',
    })
    expect(r.status, JSON.stringify(r.body)).toBeGreaterThanOrEqual(400)
  })

  it('var olmayan davet kimliği reddedilir', async () => {
    const r = await a.rpc('accept_invitation_by_id', {
      p_invitation_id: '00000000-0000-0000-0000-000000000000',
      p_full_name: 'Test',
    })
    expect(r.status).toBeGreaterThanOrEqual(400)
  })

  it('anon iki RPC\'yi de çağıramaz', async () => {
    for (const [ad, govde] of [
      ['my_pending_invitations', {}],
      ['accept_invitation_by_id', { p_invitation_id: '00000000-0000-0000-0000-000000000000', p_full_name: 'x' }],
    ] as const) {
      const res = await fetch(`${URL}/rest/v1/rpc/${ad}`, {
        method: 'POST',
        headers: { apikey: ANON as string, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(govde),
      })
      expect(res.status, ad).toBeGreaterThanOrEqual(400)
    }
  })
})
