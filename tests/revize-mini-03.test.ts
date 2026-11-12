import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planPageRangeChange } from '@/lib/page-range-plan'

// Revize Mini 03 (09.11.2026): çok parçalı kitapta sayfa aralığı düzeltme.

describe('Mini 03 · ekran önizlemesi (planPageRangeChange)', () => {
  const base = { oldStart: 84, oldEnd: 96, usedPages: [84, 85] }

  it('kullanılmamış sayfa eklenir/çıkarılır, kullanılmış sayfa korunur', () => {
    const r = planPageRangeChange({ ...base, newStart: 84, newEnd: 98, mode: 'resize' })
    expect(r).toEqual({ ok: true, mode: 'resize', add: [97, 98], remove: [], offset: 0 })
    const shrink = planPageRangeChange({ ...base, newStart: 84, newEnd: 90, mode: 'resize' })
    expect(shrink.ok && shrink.remove).toEqual([91, 92, 93, 94, 95, 96])
  })

  it('kullanılmış sayfa aralık dışında bırakılamaz — sayfalar adıyla söylenir', () => {
    const r = planPageRangeChange({ ...base, newStart: 86, newEnd: 98, mode: 'resize' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('sf. 84, 85')
  })

  it('baskı farkı: aynı sayfa sayısıyla kaydırma', () => {
    expect(planPageRangeChange({ ...base, newStart: 86, newEnd: 98, mode: 'shift' })).toEqual({
      ok: true,
      mode: 'shift',
      add: [],
      remove: [],
      offset: 2,
    })
  })

  it('kaydırmada sayfa sayısı değişemez; geçersiz aralık reddedilir', () => {
    expect(planPageRangeChange({ ...base, newStart: 86, newEnd: 99, mode: 'shift' }).ok).toBe(false)
    expect(planPageRangeChange({ ...base, newStart: 10, newEnd: 5, mode: 'resize' }).ok).toBe(false)
  })
})

describe('Mini 03 · 155-a SQL sözleşmesi', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/155_mini_02_03_devir_sepet_sayfa_araligi.sql'),
    'utf8'
  )
  const start = sql.indexOf('FUNCTION public.set_section_page_range(')
  const fn = sql.slice(start, sql.indexOf('$fn$;', start))

  it('eski üç parametreli imza kaldırılır (çağrı belirsiz kalmasın)', () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.set_section_page_range\(UUID, INTEGER, INTEGER\);/)
  })

  it('birimler toptan silinip yeniden kurulmaz — kimlik korunur', () => {
    expect(fn).not.toMatch(/DELETE FROM public\.book_tests WHERE section_id = p_section_id;/)
    expect(fn).toMatch(/order_index < p_page_start OR bt\.order_index > p_page_end/)
  })

  it('geri alınmış tamamlama da "kullanılmış" sayılır (yalnız active değil)', () => {
    expect(fn).toMatch(/EXISTS \(SELECT 1 FROM public\.test_completions tc WHERE tc\.book_test_id = bt\.id\)/)
    expect(fn).not.toMatch(/tc\.status = 'active'/)
  })

  it('kaydırma iki adımda (UNIQUE section_id, order_index çakışmasın)', () => {
    expect(fn).toMatch(/SET order_index = -order_index\s/)
    expect(fn).toMatch(/SET order_index = -order_index \+ v_offset/)
  })

  it('bölüm kaydı ve parça bağı değişmez', () => {
    expect(fn).not.toMatch(/part_id\s*=/)
    expect(fn).not.toMatch(/DELETE FROM public\.book_sections/)
  })
})
