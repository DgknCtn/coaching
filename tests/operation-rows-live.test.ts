import { describe, it, expect, beforeAll } from 'vitest'
import { canRunTenantTests, signInBothTenants, type Tenant } from './helpers/tenant'

// 117 · teacher_operation_rows SECURITY INVOKER olmalı: başka kiracının
// alan kimliğiyle çağrılınca RLS satır döndürmemeli. DEFINER olsaydı RLS
// atlanır ve her öğretmen her kiracıyı görürdü.

describe.skipIf(!canRunTenantTests)('teacher_operation_rows · canlı', () => {
  let a: Tenant
  let b: Tenant

  beforeAll(async () => {
    const t = await signInBothTenants()
    a = t.a
    b = t.b
  }, 30_000)

  it('kendi alanında satır döner (POZİTİF KONTROL)', async () => {
    const r = await a.rpc<unknown[]>('teacher_operation_rows', { p_workspace_id: a.workspaceId })
    expect(r.code, JSON.stringify(r.body)).toBeNull()
    expect(r.body.length).toBeGreaterThan(0)
  })

  it('yabancı kiracının alanıyla çağrılınca BOŞ döner', async () => {
    const r = await a.rpc<unknown[]>('teacher_operation_rows', { p_workspace_id: b.workspaceId })
    expect(r.code).toBeNull()
    expect(r.body).toEqual([])
  })
})
