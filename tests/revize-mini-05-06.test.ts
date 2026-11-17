import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  defaultTargetPlan,
  nextPlanNo,
  parseClosingResult,
  planDisplayTitle,
  planPercent,
  planResult,
  planResultLine,
} from '@/lib/homework-plan'

// Revize Mini 05 + Mini 06 (1. aşama) — Ödev Planı kaydı (migration 156).

describe('Mini 05 · başlık ve sıra', () => {
  it('numaralı ön ek sistemden, açıklama öğretmenden', () => {
    expect(planDisplayTitle({ planNo: 1, titleSuffix: null, legacyTitle: null })).toBe('1. Ödev Planı')
    expect(planDisplayTitle({ planNo: 2, titleSuffix: ' Yazılı Hazırlığı ', legacyTitle: null })).toBe(
      '2. Ödev Planı · Yazılı Hazırlığı'
    )
  })

  it('eski başlık AYNEN korunur (toplu değişiklik yok)', () => {
    expect(planDisplayTitle({ planNo: 3, titleSuffix: null, legacyTitle: '5. Hafta Ödevi' })).toBe('5. Hafta Ödevi')
  })

  it('sıra gerçek kayıtlardan; başlıktaki rakamdan hesaplanmaz', () => {
    expect(nextPlanNo([])).toBe(1)
    // Eski "5. Hafta Ödevi" başlıklı tek plan: sıradaki 2, 6 değil.
    expect(nextPlanNo([{ planNo: 1 }])).toBe(2)
    expect(nextPlanNo([{ planNo: 1 }, { planNo: 3 }])).toBe(4)
  })
})

describe('Mini 06 · sepetin varsayılan hedefi', () => {
  const now = new Date('2026-11-17T10:00:00Z')
  const plan = (planNo: number, status: 'open' | 'closed', dueAt: string | null) => ({ planNo, status, dueAt })

  it('teslimi geçmemiş son açık plan', () => {
    const plans = [plan(1, 'open', '2026-11-20T15:00:00Z'), plan(2, 'open', '2026-11-24T15:00:00Z')]
    expect(defaultTargetPlan(plans, now)?.planNo).toBe(2)
  })

  it('teslimi geçmiş ya da kapalı plan hedef olmaz → yeni plan', () => {
    expect(defaultTargetPlan([plan(1, 'open', '2026-11-10T15:00:00Z')], now)).toBeNull()
    expect(defaultTargetPlan([plan(1, 'closed', '2026-11-24T15:00:00Z')], now)).toBeNull()
  })
})

describe('Mini 06 · plan sonucu — verilen iptalleri düşmez', () => {
  // Belgedeki kabul: 6 testten 2'si tamamlandı, sonra 2 test devredildi.
  const items = [
    { status: 'completed' },
    { status: 'completed' },
    { status: 'cancelled', carriedToItemId: 'yeni-1' },
    { status: 'cancelled', carriedToItemId: 'yeni-2' },
    { status: 'pending' },
    { status: 'pending_approval' },
  ]

  it('eski plan 2/6 (%33,3) kalır; devredilen ayrıca yazılır', () => {
    const r = planResult(items)
    expect([r.done, r.given]).toEqual([2, 6])
    expect(planPercent(r)).toBe(33.3)
    expect(r.carried).toBe(2)
    expect(planResultLine(r)).toBe('2/6 · %33,3 · 2 devredildi · 1 onay bekliyor')
  })

  it('onay bekleyen "yapılmadı" sayılmaz; aktif yükten çıkarılan ayrı', () => {
    const r = planResult([...items, { status: 'cancelled', carriedToItemId: null }])
    expect(r.pendingApproval).toBe(1)
    expect(r.remaining).toBe(1)
    expect(r.released).toBe(1)
    expect(r.given).toBe(7)
  })

  it('kapanış sonucu (SQL snake_case) aynı alanlara çözülür', () => {
    expect(
      parseClosingResult({ given: 6, done: 2, pending_approval: 1, remaining: 1, carried: 2, released: 0, tasks_done: 1, tasks_open: 0, tasks_closed: 0 })
    ).toEqual({ given: 6, done: 2, pendingApproval: 1, remaining: 1, carried: 2, released: 0, tasksDone: 1, tasksOpen: 0, tasksClosed: 0 })
  })
})

describe('156 · SQL sözleşmesi', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/156_homework_plans.sql'), 'utf8')
  const body = (fn: string, end = '$fn$;') => {
    const start = sql.indexOf(`FUNCTION public.${fn}(`)
    return sql.slice(start, sql.indexOf(end, start))
  }

  it('numara yalnız _open_homework_plan\'da, öğrenci satırı kilitlenerek alınır', () => {
    const open = body('_open_homework_plan')
    expect(open).toMatch(/FOR UPDATE/)
    expect(open).toMatch(/MAX\(plan_no\), 0\) \+ 1/)
    expect(sql).toMatch(/UNIQUE \(student_id, plan_no\)/)
  })

  it('plana ekleme aynı partiye yazar; yeni parti yalnız parti yoksa', () => {
    const create = body('create_homework_batch', '$$;')
    expect(create).toMatch(/WHERE plan_id = v_plan\.id/)
    expect(create).toMatch(/IF v_batch_id IS NULL THEN/)
    expect(create).toMatch(/Bu ödev planı kapatılmış/)
    // Mini 02 devir dalı korunur.
    expect(create).toMatch(/release_reason = 'Devredildi'/)
  })

  it('teslim değişikliği ilk teslimi korur, kalemlere dokunmaz', () => {
    const due = body('set_homework_plan_due')
    expect(due).toMatch(/initial_due_at = COALESCE\(initial_due_at/)
    expect(due).not.toMatch(/homework_items/)
  })

  it('kapatma tekrar çağrılınca görüntü değişmez', () => {
    const close = body('close_homework_plan')
    expect(close).toMatch(/IF v_plan\.status = 'closed' THEN\s+RETURN v_plan\.closing_result/)
  })

  it('geçiş eski başlığı korur, numarayı created_at sırasıyla verir', () => {
    expect(sql).toMatch(/ROW_NUMBER\(\) OVER \(PARTITION BY hb\.student_id ORDER BY hb\.created_at, hb\.id\)/)
    expect(sql).toMatch(/legacy_title/)
    expect(sql).not.toMatch(/UPDATE public\.homework_batches\s+SET title[^;]*WHERE hb\.plan_id IS NULL/)
  })

  it('sonuç tanımı TS ile aynı: verilen tüm kalemler, devredilen carried_to dolu', () => {
    const result = body('_homework_plan_result')
    expect(result).toMatch(/'given',\s+COUNT\(hi\.id\)/)
    expect(result).toMatch(/'carried',[^\n]*carried_to_item_id IS NOT NULL/)
    expect(result).toMatch(/'released',[^\n]*carried_to_item_id IS NULL/)
  })

  it('iç yardımcılar istemciye kapalı; anon yetkisi yok', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\._open_homework_plan\(UUID, TEXT, TIMESTAMPTZ\) FROM PUBLIC, anon, authenticated/)
    expect(sql).not.toMatch(/GRANT\s+EXECUTE[^;]*TO\s+[^;]*anon/i)
  })
})
