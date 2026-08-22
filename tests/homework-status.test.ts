import { describe, it, expect } from 'vitest'
import { deriveTestState, testStateLabel, COUNTER_LABEL } from '@/lib/homework-status'
import { formatSelectedUnits } from '@/lib/book-map'

const today = new Date('2026-03-10')

describe('deriveTestState', () => {
  it('treats an active completion as completed regardless of the item row', () => {
    expect(deriveTestState({ hasActiveCompletion: true, itemStatus: 'pending', today })).toBe('completed')
  })

  it('returns not_assigned when there is no open homework item', () => {
    expect(deriveTestState({ itemStatus: null, today })).toBe('not_assigned')
    expect(deriveTestState({ itemStatus: 'cancelled', today })).toBe('not_assigned')
  })

  it('returns assigned for a pending item whose due date has not passed', () => {
    expect(deriveTestState({ itemStatus: 'pending', dueDate: '2026-03-15', today })).toBe('assigned')
  })

  it('returns overdue for a pending item whose due date has passed', () => {
    expect(deriveTestState({ itemStatus: 'pending', dueDate: '2026-03-01', today })).toBe('overdue')
  })

  // R2 Ek Revizyon §2 — bu paketin asıl düzelttiği davranış.
  it('prefers pending_approval over overdue once the student submits a late test', () => {
    expect(
      deriveTestState({ itemStatus: 'pending_approval', dueDate: '2026-03-01', today })
    ).toBe('pending_approval')
  })

  it('returns returned for a rejected item that is not yet overdue', () => {
    expect(
      deriveTestState({ itemStatus: 'pending', dueDate: '2026-03-15', rejectedAt: '2026-03-09T10:00:00Z', today })
    ).toBe('returned')
  })

  it('surfaces overdue ahead of returned when both apply', () => {
    expect(
      deriveTestState({ itemStatus: 'pending', dueDate: '2026-03-01', rejectedAt: '2026-03-09T10:00:00Z', today })
    ).toBe('overdue')
  })

  it('returns no_test for a matrix cell with no such test in the section', () => {
    expect(deriveTestState({ isMissingTest: true, hasActiveCompletion: true, today })).toBe('no_test')
  })

  it('does not mark a test overdue on its own due date', () => {
    expect(deriveTestState({ itemStatus: 'pending', dueDate: '2026-03-10', today })).toBe('assigned')
  })
})

describe('testStateLabel', () => {
  it('says "Reddedildi" to the teacher and "İade Edildi" to the student', () => {
    expect(testStateLabel('returned', 'teacher')).toBe('Reddedildi')
    expect(testStateLabel('returned', 'student')).toBe('İade Edildi')
  })

  it('shares the same wording for states that mean the same thing to both roles', () => {
    expect(testStateLabel('pending_approval', 'teacher')).toBe('Onay Bekliyor')
    expect(testStateLabel('pending_approval', 'student')).toBe('Onay Bekliyor')
  })
})

describe('COUNTER_LABEL', () => {
  it('uses the R2 counter names', () => {
    expect(COUNTER_LABEL.assigned).toBe('Öğrenciye Verilen')
    expect(COUNTER_LABEL.pending).toBe('Öğrenciden Beklenen')
    expect(COUNTER_LABEL.overdue).toBe('Süresi Geçen')
  })
})

describe('formatSelectedUnits', () => {
  // R4 §7: ardışık test numaraları da sıkıştırılır — 70-100 testlik
  // planlarda tek tek satır dökmek okunmaz bir mesaj üretiyordu.
  it('compresses consecutive test numbers', () => {
    expect(formatSelectedUnits([3, 1, 2], 'test')).toBe('1-3. Test')
    expect(formatSelectedUnits([1, 2, 3, 4, 5], 'test')).toBe('1-5. Test')
  })

  it('keeps non-consecutive test numbers separate', () => {
    expect(formatSelectedUnits([5, 9, 7], 'test')).toBe('5, 7, 9. Test')
  })

  // Sayfa takipli kitapta birim tek bir fiziksel sayfadır (022), bu yüzden
  // numaralar sayfa numarasıdır ve "sf." etiketiyle yazılır.
  it('labels page books as page ranges', () => {
    expect(formatSelectedUnits([4, 5, 6], 'page')).toBe('sf. 4-6')
    expect(formatSelectedUnits([1, 4, 5, 6, 9], 'page')).toBe('sf. 1, 4-6, 9')
  })

  it('returns an empty string when nothing is selected', () => {
    expect(formatSelectedUnits([], 'test')).toBe('')
  })
})
