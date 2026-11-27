import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Ödev Verme Akışını Kısaltma" (26.11.2026) §1: Kitap Ata varsayılanı
// Aktif. RPC (098) atamayı 'pending' açar; Aktif istenirse hemen
// set_student_book_plan ile Aktif'e alınır. "Bekliyor" seçilirse ikinci
// çağrı YAPILMAZ.

const rpc = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/workspace', () => ({
  getTeacherContext: async () => ({ workspaceId: 'ws', activeTerm: { id: 'term' } }),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))

const STUDENT = '11111111-1111-4111-8111-111111111111'
const BOOK = '22222222-2222-4222-8222-222222222222'

describe('assignBookAction', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockImplementation(async (name: string) =>
      name === 'assign_book_to_student'
        ? { data: { student_book_assignment_id: 'asg' }, error: null }
        : { data: { assignment_id: 'asg' }, error: null }
    )
  })

  it('varsayılan Aktif: atar ve hemen Aktif yapar', async () => {
    const { assignBookAction } = await import('@/app/(dashboard)/teacher/students/actions')
    const r = await assignBookAction(STUDENT, BOOK, null)
    expect(r).toEqual({ success: true, assignmentId: 'asg', status: 'active' })
    expect(rpc.mock.calls.map(c => c[0])).toEqual(['assign_book_to_student', 'set_student_book_plan'])
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_assignment_id: 'asg', p_status: 'active' })
  })

  it('Bekliyor bilerek seçilirse yalnız atar', async () => {
    const { assignBookAction } = await import('@/app/(dashboard)/teacher/students/actions')
    const r = await assignBookAction(STUDENT, BOOK, null, 'pending')
    expect(r).toEqual({ success: true, assignmentId: 'asg', status: 'pending' })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('Aktif yapma düşerse atama korunur, açık uyarı döner', async () => {
    rpc.mockImplementation(async (name: string) =>
      name === 'assign_book_to_student'
        ? { data: { student_book_assignment_id: 'asg' }, error: null }
        : { data: null, error: { message: 'boom' } }
    )
    const { assignBookAction } = await import('@/app/(dashboard)/teacher/students/actions')
    const r = await assignBookAction(STUDENT, BOOK, null)
    expect(r).toMatchObject({ assignmentId: 'asg', status: 'pending' })
    expect(r.error).toMatch(/Aktif yapılamadı/)
  })
})
