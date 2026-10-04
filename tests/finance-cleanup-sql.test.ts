import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// FİNANS TEMİZLİĞİ (137) — SQL SÖZLEŞMESİ
//
// Finans 066'dan beri yalnız çalışma alanı SAHİBİNE açık; yeni silme
// fonksiyonları da bu kuralı taşımalı. Toptan silme ayrıca öğrencinin
// adının birebir yazılmasını ister ve öğrencinin kendisine dokunmaz.

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/137_finance_cleanup.sql'),
  'utf8'
)

function fn(name: string): string {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start, `${name} tanımı yok`).toBeGreaterThan(-1)
  return SQL.slice(start, SQL.indexOf('$fn$;', start)).replace(/--.*$/gm, '')
}

describe('137 · finans temizliği', () => {
  it.each(['delete_student_fee', 'delete_payment_notice', 'purge_student_finance'])(
    '%s yalnız sahibe açık ve silmeden önce denetler',
    (name) => {
      const body = fn(name)
      const check = body.indexOf("has_workspace_role(v_")
      expect(body).toMatch(/has_workspace_role\(v_\w+(\.workspace_id)?, ARRAY\['owner'\]\)/)
      expect(check).toBeLessThan(body.indexOf('DELETE FROM'))
    }
  )

  it('toptan silme ad eşleşmesini silmeden önce ister', () => {
    const body = fn('purge_student_finance')
    const confirm = body.indexOf("btrim(COALESCE(p_confirm_name, ''))")
    expect(confirm).toBeGreaterThan(-1)
    expect(confirm).toBeLessThan(body.indexOf('DELETE FROM'))
  })

  it('toptan silme dört finans tablosunu temizler, öğrenciyi silmez', () => {
    const body = fn('purge_student_finance')
    for (const t of ['student_fees', 'finance_lessons', 'finance_payments', 'parent_payment_notices']) {
      expect(body).toContain(`DELETE FROM public.${t} WHERE student_id = p_student_id`)
    }
    expect(body).not.toMatch(/DELETE FROM public\.students/)
    // Ücret önce: otomatik tahakkuk senkronu yeniden yazamasın.
    expect(body.indexOf('public.student_fees')).toBeLessThan(body.indexOf('public.finance_lessons'))
  })

  it('anon\'a açılmaz', () => {
    expect(SQL).not.toMatch(/GRANT[^;]*TO[^;]*\banon\b/)
  })
})
