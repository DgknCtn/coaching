import { beforeEach, describe, expect, it, vi } from 'vitest'

// Faz 2d · Ödev şablonları — şablon yalnız TASLAK görev üretir; bozuk
// içerik ve geçersiz girdi reddedilir.

const bulk = vi.fn()
let templateRow: { items: unknown } | null = null
const insert = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/workspace', () => ({
  getTeacherContext: async () => ({ workspaceId: 'ws', profile: { id: 'p' } }),
}))
vi.mock('@/app/(dashboard)/teacher/students/[studentId]/dersler/actions', () => ({ createTasksBulkAction: bulk }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: templateRow }),
        insert: (row: unknown) => {
          insert(row)
          return { select: () => ({ single: async () => ({ data: { id: 'tpl' }, error: null }) }) }
        },
      }
      return q
    },
  }),
}))

const S = '11111111-1111-4111-8111-111111111111'
const T = '22222222-2222-4222-8222-222222222222'
const SC = '33333333-3333-4333-8333-333333333333'

describe('ödev şablonları', () => {
  beforeEach(() => {
    bulk.mockReset()
    insert.mockReset()
    bulk.mockResolvedValue({ success: true, created: 2 })
  })

  it('uygulama kalemleri taslak görev olarak üretir (yayın yok)', async () => {
    templateRow = {
      items: [
        { scope_id: SC, kind: 'gorev', title: 'Her gün 40 paragraf', target_minutes: null, checklist: [] },
        { scope_id: SC, kind: 'sure', title: 'Problem çalışması', target_minutes: 90, checklist: [] },
      ],
    }
    const { applyTemplateAction } = await import('@/app/(dashboard)/teacher/students/[studentId]/homework/new/template-actions')
    const r = await applyTemplateAction(S, T)
    expect(r).toEqual({ created: 2 })
    const [studentId, rows] = bulk.mock.calls[0]
    expect(studentId).toBe(S)
    expect(rows).toEqual([
      { scopeId: SC, kind: 'gorev', title: 'Her gün 40 paragraf', targetMinutes: null, checklist: [] },
      { scopeId: SC, kind: 'sure', title: 'Problem çalışması', targetMinutes: 90, checklist: [] },
    ])
    // createTasksBulkAction yalnız taslak üretir (publish: false) — bkz. dersler/actions.
  })

  it('bozuk şablon içeriği ve bulunamayan şablon reddedilir', async () => {
    const { applyTemplateAction } = await import('@/app/(dashboard)/teacher/students/[studentId]/homework/new/template-actions')
    templateRow = { items: [{ kind: 'gorev' }] }
    expect((await applyTemplateAction(S, T)).error).toMatch(/okunamadı/)
    templateRow = null
    expect((await applyTemplateAction(S, T)).error).toMatch(/bulunamadı/)
    expect(bulk).not.toHaveBeenCalled()
  })

  it('kaydetme: boş ad ve boş kalem reddedilir; geçerli kayıt snake_case yazılır', async () => {
    const { saveTemplateAction } = await import('@/app/(dashboard)/teacher/students/[studentId]/homework/new/template-actions')
    expect((await saveTemplateAction({ name: ' ', items: [] })).error).toBeTruthy()
    const ok = await saveTemplateAction({
      name: 'TYT rutin',
      items: [{ scopeId: SC, kind: 'checklist', title: 'Tekrar', targetMinutes: null, checklist: ['Türev', 'İntegral'] }],
    })
    expect(ok.id).toBe('tpl')
    expect(insert.mock.calls[0][0]).toMatchObject({
      workspace_id: 'ws',
      name: 'TYT rutin',
      items: [{ scope_id: SC, kind: 'checklist', title: 'Tekrar', target_minutes: null, checklist: ['Türev', 'İntegral'] }],
    })
  })
})
