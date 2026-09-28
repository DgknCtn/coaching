import { describe, it, expect, beforeAll } from 'vitest'
import { canRunTenantTests, signInBothTenants, type Tenant } from './helpers/tenant'

// YÖNETİM FONKSİYONLARI (122-126) — admin olmayan hiç kimse çağıramaz.
// Test kiracılarından yönetici OLMAYAN biri 'Permission denied' almalı;
// anon zaten yetkisiz. Migration'lar canlıda değilse bu dosya kırmızıdır.
//
// Test hesapları bilerek platform yöneticisi olabilir (28 Eylül 2026,
// kullanıcı kararı: panel onlarla deneniyor). İkisi de yöneticiyse
// "öğretmen çağıramaz" testleri kırmızı değil ATLANMIŞ görünür — yönetici
// zaten çağırabilir, bu bir açık değil. Anon testleri her durumda koşar.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ZERO = '00000000-0000-0000-0000-000000000000'

const CALLS: [string, Record<string, unknown>][] = [
  ['admin_user_counts', {}],
  ['admin_timeseries', { p_days: 7 }],
  ['admin_teacher_activity', { p_days: 7 }],
  ['admin_feature_usage', { p_days: 7 }],
  ['admin_revenue', { p_months: 3 }],
  ['admin_workspace_activity', { p_workspace_id: ZERO, p_days: 7 }],
  ['admin_system_status', {}],
  ['admin_support_metrics', { p_days: 30 }],
  ['admin_deletion_queue', {}],
  ['purge_auth_event_ips', {}],
  ['admin_list_workspaces', {}],
  ['admin_login_countries', { p_days: 7 }],
  // 128 — işlemler: yönetici olmayan için gerekçe/kayıt denetimine hiç gelinmez.
  ['admin_extend_trial', { p_workspace_id: ZERO, p_days: 1, p_reason: 'canlı yetki testi' }],
  ['admin_set_workspace_status', { p_workspace_id: ZERO, p_status: 'active', p_reason: 'canlı yetki testi' }],
  ['admin_grant_license', { p_workspace_id: ZERO, p_student_count: 1, p_months: 1, p_reason: 'canlı yetki testi' }],
  ['admin_set_student_limit', { p_workspace_id: ZERO, p_limit: 1, p_reason: 'canlı yetki testi' }],
  ['admin_resolve_order', { p_order_id: ZERO, p_outcome: 'failed', p_reason: 'canlı yetki testi' }],
  ['admin_list_actions', { p_limit: 1 }],
]

describe.skipIf(!canRunTenantTests)('yönetim fonksiyonları · canlı yetki', () => {
  let a: Tenant
  // Yönetici olmayan test kiracısı; yoksa null.
  let nonAdmin: Tenant | null = null

  beforeAll(async () => {
    const both = await signInBothTenants()
    a = both.a
    for (const t of [both.a, both.b]) {
      const r = await t.rpc<boolean>('is_platform_admin', {})
      if (r.body === false) {
        nonAdmin = t
        break
      }
    }
  }, 30_000)

  for (const [name, body] of CALLS) {
    it(`${name}: öğretmen çağıramaz`, async (ctx) => {
      if (!nonAdmin) ctx.skip()
      const r = await nonAdmin!.rpc(name, body)
      expect(r.status, JSON.stringify(r.body)).toBeGreaterThanOrEqual(400)
      expect(JSON.stringify(r.body)).toMatch(/Permission denied|42501/)
    })

    it(`${name}: anon çağıramaz`, async () => {
      const res = await fetch(`${URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: ANON as string, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  }

  // 125: kullanıcı kendi yönetici bayrağını değiştiremez (her iki yönde).
  it('kullanıcı is_platform_admin bayrağını değiştiremez', async () => {
    const me = await a.select<{ id: string; is_platform_admin: boolean }[]>(
      'profiles?select=id,is_platform_admin&limit=1'
    )
    const row = me.body[0]
    const r = await a.write('PATCH', `profiles?id=eq.${row.id}`, {
      is_platform_admin: !row.is_platform_admin,
    })
    expect(r.status, JSON.stringify(r.body)).toBeGreaterThanOrEqual(400)
    expect(r.code).toBe('42501')
  })

  // 128: yönetim kaydı yalnız fonksiyonlardan; doğrudan okuma/yazma yok,
  // iç yardımcı istemciye kapalı. Yönetici hesabı için de geçerli.
  it('admin_actions doğrudan okunamaz ve yazılamaz', async () => {
    expect((await a.select('admin_actions?select=id&limit=1')).status).toBeGreaterThanOrEqual(400)
    const w = await a.write('POST', 'admin_actions', {
      actor_profile_id: ZERO,
      action: 'x',
      reason: 'doğrudan yazma denemesi',
    })
    expect(w.status).toBeGreaterThanOrEqual(400)
    const r = await a.rpc('record_admin_action', {
      p_action: 'x', p_workspace_id: null, p_target_id: null,
      p_reason: 'doğrudan yazma denemesi', p_before: {}, p_after: {},
    })
    expect(r.status).toBeGreaterThanOrEqual(400)
  })

  it('cron_runs doğrudan okunamaz', async () => {
    const r = await a.select<unknown[]>('cron_runs?select=id&limit=1')
    expect(r.status).toBeGreaterThanOrEqual(400)
  })
})
