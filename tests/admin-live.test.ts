import { describe, it, expect, beforeAll } from 'vitest'
import { canRunTenantTests, signInBothTenants, type Tenant } from './helpers/tenant'

// YÖNETİM FONKSİYONLARI (122-124) — admin olmayan hiç kimse çağıramaz.
// Test öğretmeni (platform yöneticisi DEĞİL) 'Permission denied' almalı;
// anon zaten yetkisiz. Migration'lar canlıda değilse bu dosya kırmızıdır.

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
]

describe.skipIf(!canRunTenantTests)('yönetim fonksiyonları · canlı yetki', () => {
  let a: Tenant

  beforeAll(async () => {
    a = (await signInBothTenants()).a
  }, 30_000)

  for (const [name, body] of CALLS) {
    it(`${name}: öğretmen çağıramaz`, async () => {
      const r = await a.rpc(name, body)
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

  it('cron_runs doğrudan okunamaz', async () => {
    const r = await a.select<unknown[]>('cron_runs?select=id&limit=1')
    expect(r.status).toBeGreaterThanOrEqual(400)
  })
})
