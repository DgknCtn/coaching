import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canCarry, countApplicable, countCarryable, filterCarryable } from '@/lib/bulk-actions'
import { toHomeworkItems, type BasketUnit } from '@/lib/weekly-plan'
import type { HomeworkTestState } from '@/lib/homework-status'

// Revize Mini 02 (09.11.2026): kitap içinden açık çalışmayı haftaya aktarma.

describe('Mini 02 · hangi çalışma taşınır', () => {
  const table: [HomeworkTestState, boolean][] = [
    ['assigned', true],
    ['overdue', true],
    ['returned', true],
    ['pending_approval', false], // öğrenci teslim etti — onun işi
    ['completed', false], // tamamlanan kısım yeniden görev olmaz
    ['not_assigned', false], // bu "Ödeve Ekle"nin işi
    ['no_test', false],
  ]
  it.each(table)('%s → %s', (state, expected) => {
    expect(canCarry(state)).toBe(expected)
  })

  it('kabul: 3 açık test seçilince üçü de aktarılabilir', () => {
    const units = [
      { id: 't1', state: 'overdue' as const },
      { id: 't2', state: 'assigned' as const },
      { id: 't3', state: 'overdue' as const },
      { id: 't4', state: 'completed' as const },
    ]
    expect(countCarryable(units.map(u => u.state))).toBe(3)
    expect(filterCarryable(units)).toEqual(['t1', 't2', 't3'])
  })

  it('mevcut sayım nesnesinin şekli değişmedi', () => {
    expect(Object.keys(countApplicable([])).sort()).toEqual(['approve', 'assign', 'complete', 'revert', 'selected'])
  })
})

describe('Mini 02 · yayın kalemi', () => {
  const unit = (id: string, carry?: boolean): BasketUnit => ({
    student_book_assignment_id: 'sba',
    book_test_id: id,
    bookId: 'b',
    bookTitle: 'Kitap',
    sectionId: 's',
    sectionTitle: 'Bölüm',
    orderIndex: 1,
    trackingMode: 'test',
    carry,
  })

  it('devir kalemi carry taşır, yeni kalem taşımaz', () => {
    expect(toHomeworkItems([unit('a'), unit('b', true)])).toEqual([
      { student_book_assignment_id: 'sba', book_test_id: 'a' },
      { student_book_assignment_id: 'sba', book_test_id: 'b', carry: true },
    ])
  })
})

describe('Mini 02 · 155-b SQL sözleşmesi', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/155_mini_02_03_devir_sepet_sayfa_araligi.sql'),
    'utf8'
  )
  const start = sql.indexOf('FUNCTION public.create_homework_batch(')
  const fn = sql.slice(start, sql.indexOf('$$;', start))

  it('kaynak silinmez: Devredildi + carried_to; yeni kalem carried_from ile', () => {
    expect(fn).not.toMatch(/DELETE FROM public\.homework_items/)
    expect(fn).toMatch(/release_reason = 'Devredildi'/)
    expect(fn).toMatch(/carried_to_item_id = v_new_item/)
    expect(fn).toMatch(/carried_from_item_id/)
  })

  it('öğrencinin teslim ettiği iş devredilmez', () => {
    expect(fn).toMatch(/hi\.status = 'pending_approval'[\s\S]*devredilemez/)
  })

  it('carry olmayan kalemde eski "zaten atanmış" kontrolü aynen durur', () => {
    expect(fn).toMatch(/hi\.status IN \('pending', 'pending_approval'\)[\s\S]*zaten ödev olarak atanmış/)
  })

  it('imza 132 ile aynı (eski çağrılar bozulmaz)', () => {
    expect(sql).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.create_homework_batch\(UUID, UUID, UUID, DATE, TEXT, TEXT, JSONB, TIMESTAMPTZ\) TO authenticated/
    )
  })
})
