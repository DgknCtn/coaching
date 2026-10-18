import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// 148 — AKADEMİK GÖREVLER: SQL GÜVENLİK KURALLARI
//
// Canlı veritabanı olmadan kurallar metin olarak denetlenir (repodaki
// diğer *-sql testleriyle aynı yöntem). Davranış PGlite üzerinde 001-148
// zinciriyle ayrıca senaryo olarak doğrulandı (yetkiler, yayın, süre /
// checklist ilerlemesi, hafta geçişi).
// ============================================================

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/148_academic_tasks.sql'), 'utf8')
const code = sql
  .split(/\r?\n/)
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

function body(name: string): string {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(([\\s\\S]*?)\\$fn\\$([\\s\\S]*?)\\$fn\\$`).exec(code)
  expect(m, name).not.toBeNull()
  return m![2]
}

const RPCS = [
  'create_academic_task',
  'update_academic_task',
  'delete_academic_task',
  'set_academic_task_plan_date',
  'set_academic_task_done',
  'toggle_checklist_item',
  'set_academic_task_minutes',
  'set_academic_task_tracked',
  'set_academic_task_closed',
  'publish_draft_academic_tasks',
  'roll_open_tasks_to_flow',
]

describe('148 akademik görevler', () => {
  it('doğrudan yazma kapalı; okuma RLS ile', () => {
    expect(code).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.academic_tasks FROM anon, authenticated/)
    expect(code).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.academic_task_checklist_items FROM anon, authenticated/)
    expect(code).toMatch(/ALTER TABLE public\.academic_tasks ENABLE ROW LEVEL SECURITY/)
  })

  it('öğrenci taslağı görmez', () => {
    expect(code).toMatch(/is_student_self\(student_id\)\)\s+AND status <> 'draft'/)
  })

  it('her RPC yetki denetler, anon\'a kapalı', () => {
    for (const name of RPCS) {
      const b = body(name)
      expect(b, name).toMatch(/academic_task_actor|has_workspace_role/)
      expect(code, name).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon`))
      expect(code, name).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO authenticated`))
    }
    expect(code).not.toMatch(/TO anon/)
  })

  it('öğrenci öğretmen görevini silemez, metnini değiştiremez; takibe alınanı silemez (§8)', () => {
    const del = body('delete_academic_task')
    expect(del).toMatch(/v_actor = 'student' AND v_task\.created_by_role <> 'student'/)
    expect(del).toMatch(/v_actor = 'student' AND v_task\.tracked/)
    expect(body('update_academic_task')).toMatch(/v_actor = 'student' AND v_task\.created_by_role <> 'student'/)
    // Takibi yalnız öğretmen değiştirir.
    expect(body('set_academic_task_tracked')).toMatch(/IS DISTINCT FROM 'teacher'/)
  })

  it('güne yerleştirme yalnız planned_for_date yazar (§7: teslim değişmez)', () => {
    const b = body('set_academic_task_plan_date')
    expect(b).toMatch(/SET planned_for_date = p_date/)
    expect(b).not.toMatch(/due_at\s*=/)
  })

  it('yayın plan teslimini varsayılan yapar, tarihsiz istisnayı korur (§5)', () => {
    expect(body('publish_draft_academic_tasks')).toMatch(
      /due_at = CASE WHEN undated THEN NULL ELSE COALESCE\(due_at, p_due_at, v_flow\.due_at\) END/
    )
  })

  it('hafta geçişi yalnız açık tarihsiz görevi taşır ve günü temizler (P0 8, 10)', () => {
    const b = body('roll_open_tasks_to_flow')
    expect(b).toMatch(/status = 'open'/)
    expect(b).toMatch(/AND undated/)
    expect(b).toMatch(/planned_for_date = NULL/)
    expect(b).toMatch(/weekly_flow_id IS DISTINCT FROM v_flow_id/)
  })
})
