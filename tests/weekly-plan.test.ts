import { describe, expect, it } from 'vitest'

import { resolveBasketItems, toHomeworkItems, type BasketUnit } from '@/lib/weekly-plan'
import { weeklyPlanDraftSchema } from '@/lib/validation'

// ============================================================
// R6-18 · kabul #95 — "Plan sepeti tarayıcı refresh sonrası korunmalı"
//
// Sepet Supabase'de taslak olarak saklanır (019_weekly_plan_drafts) ve sayfa
// yenilendiğinde geri yüklenir. R6 bu davranışı ZORUNLU regresyon kabulü
// sayıyor ama denetimde hiç testi olmadığı görüldü.
//
// Kalıcılığın iki sözleşmesi var ve ikisi de saf: taslağın kabul ettiği
// yük (weeklyPlanDraftSchema) ve geri yüklenen id'lerin haritayla
// eşleştirilmesi (resolveBasketItems).
// ============================================================

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

function unit(id: string, over: Partial<BasketUnit> = {}): BasketUnit {
  return {
    student_book_assignment_id: UUID_A,
    book_test_id: id,
    bookId: 'kitap-1',
    bookTitle: '345 Matematik',
    sectionId: 'bolum-1',
    sectionTitle: 'Polinomlar',
    orderIndex: 1,
    trackingMode: 'test',
    ...over,
  }
}

function indexOf(units: BasketUnit[]): Map<string, BasketUnit> {
  return new Map(units.map(u => [u.book_test_id, u]))
}

describe('resolveBasketItems · sepet geri yükleme', () => {
  it('taslaktaki sırayı ve kitap/bölüm bağlamını korur', () => {
    const a = unit('t1', { orderIndex: 3 })
    const b = unit('t2', {
      bookId: 'kitap-2',
      bookTitle: 'MÖF Matematik',
      sectionId: 'bolum-2',
      sectionTitle: 'Üslü Sayılar',
      trackingMode: 'page',
      orderIndex: 15,
    })

    const { units, missingIds } = resolveBasketItems(['t1', 't2'], indexOf([a, b]))

    expect(units.map(u => u.book_test_id)).toEqual(['t1', 't2'])
    expect(units[1].sectionTitle).toBe('Üslü Sayılar')
    expect(units[1].trackingMode).toBe('page')
    expect(missingIds).toEqual([])
  })

  it('silinmiş kitap/bölümden kalan hayalet id yayına gitmez', () => {
    const a = unit('t1')

    const { units, missingIds } = resolveBasketItems(['t1', 'silinmis'], indexOf([a]))

    expect(units).toHaveLength(1)
    expect(missingIds).toEqual(['silinmis'])
  })

  it('tekrarlı id tek kalem üretir (R6 §11: duplicate completion olmamalı)', () => {
    const a = unit('t1')

    const { units } = resolveBasketItems(['t1', 't1'], indexOf([a]))

    expect(units).toHaveLength(1)
  })

  it('boş sepet boş sonuç verir', () => {
    expect(resolveBasketItems([], new Map())).toEqual({ units: [], missingIds: [] })
  })
})

describe('toHomeworkItems · yayın yükü', () => {
  it('RPC yalnız atama ve birim id alır', () => {
    const items = toHomeworkItems([unit('t1'), unit('t2', { student_book_assignment_id: UUID_B })])

    expect(items).toEqual([
      { student_book_assignment_id: UUID_A, book_test_id: 't1' },
      { student_book_assignment_id: UUID_B, book_test_id: 't2' },
    ])
  })
})

describe('weeklyPlanDraftSchema · taslak sözleşmesi', () => {
  const base = {
    workspaceId: UUID_A,
    studentId: UUID_B,
    items: [{ student_book_assignment_id: UUID_A, book_test_id: UUID_B }],
  }

  it('çok kitaplı sepeti, teslim tarihini ve notu kabul eder', () => {
    const result = weeklyPlanDraftSchema.safeParse({
      ...base,
      dueDate: '2026-08-31',
      title: 'Haftalık Plan - 12. Hafta',
      note: 'Tekrarlarımızı unutmayalım.',
      items: [
        { student_book_assignment_id: UUID_A, book_test_id: UUID_B },
        { student_book_assignment_id: UUID_B, book_test_id: UUID_A },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('henüz tarih girilmemiş taslak da kaydedilebilir', () => {
    // Sepet doldurulurken teslim tarihi çoğu zaman en son yazılır; taslak
    // bunu beklemek zorunda değil.
    expect(weeklyPlanDraftSchema.safeParse({ ...base, dueDate: '' }).success).toBe(true)
    expect(weeklyPlanDraftSchema.safeParse(base).success).toBe(true)
  })

  it('bozuk tarih biçimini reddeder', () => {
    expect(weeklyPlanDraftSchema.safeParse({ ...base, dueDate: '31.08.2026' }).success).toBe(false)
  })

  it('boş sepet geçerlidir (son çalışma çıkarıldığında taslak temizlenir)', () => {
    expect(weeklyPlanDraftSchema.safeParse({ ...base, items: [] }).success).toBe(true)
  })

  it('1000 kalemi aşan taslağı reddeder', () => {
    const items = Array.from({ length: 1001 }, () => ({
      student_book_assignment_id: UUID_A,
      book_test_id: UUID_B,
    }))
    expect(weeklyPlanDraftSchema.safeParse({ ...base, items }).success).toBe(false)
  })

  it('uuid olmayan kalem kimliğini reddeder', () => {
    expect(
      weeklyPlanDraftSchema.safeParse({
        ...base,
        items: [{ student_book_assignment_id: 'abc', book_test_id: UUID_B }],
      }).success
    ).toBe(false)
  })
})
