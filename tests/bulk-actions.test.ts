import { describe, expect, it } from 'vitest'
import {
  countApplicable,
  filterApplicable,
  isActionApplicable,
  revertConfirmMessage,
} from '@/lib/bulk-actions'
import { isSelectableState } from '@/lib/book-map'
import type { HomeworkTestState } from '@/lib/homework-status'

// R6-03 kabul testleri 13-30.

describe('isSelectableState · mod ayrımı', () => {
  const states: HomeworkTestState[] = [
    'not_assigned',
    'assigned',
    'pending_approval',
    'overdue',
    'returned',
    'completed',
  ]

  it('kabul #30: plan modu bugünkü davranışı korur — yalnız henüz verilmedi', () => {
    expect(states.filter(s => isSelectableState(s, 'plan'))).toEqual(['not_assigned'])
  })

  it('varsayılan mod plan, mevcut çağıranlar bozulmaz', () => {
    expect(isSelectableState('completed')).toBe(false)
    expect(isSelectableState('not_assigned')).toBe(true)
  })

  it('yönetim modunda altı durumun tamamı seçilebilir', () => {
    expect(states.every(s => isSelectableState(s, 'manage'))).toBe(true)
  })

  it('boş hücre (no_test) hiçbir modda seçilemez', () => {
    expect(isSelectableState('no_test', 'manage')).toBe(false)
    expect(isSelectableState('no_test', 'plan')).toBe(false)
  })
})

describe('isActionApplicable', () => {
  it('kabul #13: henüz verilmemiş tek test doğrudan tamamlanabilir', () => {
    expect(isActionApplicable('complete', 'not_assigned')).toBe(true)
  })

  it('kabul #14: süresi geçmiş test doğrudan tamamlanabilir', () => {
    expect(isActionApplicable('complete', 'overdue')).toBe(true)
  })

  it('kabul #15: onay bekleyen test Onayla ile tamamlanabilir', () => {
    expect(isActionApplicable('approve', 'pending_approval')).toBe(true)
  })

  it('Onayla yalnız Onay Bekliyor durumunda çalışır', () => {
    const others: HomeworkTestState[] = ['not_assigned', 'assigned', 'overdue', 'returned']
    expect(others.some(s => isActionApplicable('approve', s))).toBe(false)
  })

  it('tamamlanmış çalışma yeniden tamamlanmaz (duplicate koruması)', () => {
    expect(isActionApplicable('complete', 'completed')).toBe(false)
  })

  it('kabul #26: yalnız tamamlanmış çalışma geri alınabilir', () => {
    expect(isActionApplicable('revert', 'completed')).toBe(true)
    expect(isActionApplicable('revert', 'overdue')).toBe(false)
  })
})

describe('countApplicable', () => {
  it('kabul #16 + §10 örneği: 9 çalışma seçili, 2 tanesi onay bekliyor', () => {
    const states: HomeworkTestState[] = [
      'not_assigned',
      'not_assigned',
      'not_assigned',
      'assigned',
      'assigned',
      'overdue',
      'overdue',
      'pending_approval',
      'pending_approval',
    ]
    expect(countApplicable(states)).toEqual({
      selected: 9,
      // R7: "Ödeve Ekle" yalnız henüz verilmemiş çalışmalara uygulanır.
      assign: 3,
      complete: 9,
      approve: 2,
      revert: 0,
    })
  })

  it('tamamlanmışlar complete sayısına girmez, revert sayısına girer', () => {
    const states: HomeworkTestState[] = ['completed', 'completed', 'overdue']
    expect(countApplicable(states)).toEqual({
      selected: 3,
      assign: 0,
      complete: 1,
      approve: 0,
      revert: 2,
    })
  })

  it('boş seçim sıfır üretir', () => {
    expect(countApplicable([])).toEqual({
      selected: 0,
      assign: 0,
      complete: 0,
      approve: 0,
      revert: 0,
    })
  })
})

// R7 (R6-03 güncellemesi): tek harita üzerinde "Ödeve Ekle" de bir toplu
// işlemdir. Diğerlerinden farkı veriye dokunmamasıdır; seçimi haftalık plan
// sepetine taşır.
describe('assign · Ödeve Ekle', () => {
  it('yalnız henüz verilmemiş çalışmalara uygulanır', () => {
    expect(isActionApplicable('assign', 'not_assigned')).toBe(true)
    expect(isActionApplicable('assign', 'assigned')).toBe(false)
    expect(isActionApplicable('assign', 'pending_approval')).toBe(false)
    expect(isActionApplicable('assign', 'completed')).toBe(false)
    expect(isActionApplicable('assign', 'overdue')).toBe(false)
    expect(isActionApplicable('assign', 'no_test')).toBe(false)
  })

  it('karma seçimde sepete yalnız uygun birimler taşınır', () => {
    const units = [
      { id: 'a', state: 'not_assigned' as HomeworkTestState },
      { id: 'b', state: 'completed' as HomeworkTestState },
      { id: 'c', state: 'not_assigned' as HomeworkTestState },
    ]
    expect(filterApplicable('assign', units)).toEqual(['a', 'c'])
  })
})

describe('filterApplicable', () => {
  const units = [
    { id: 'a', state: 'not_assigned' as HomeworkTestState },
    { id: 'b', state: 'pending_approval' as HomeworkTestState },
    { id: 'c', state: 'completed' as HomeworkTestState },
  ]

  it('sunucuya yalnız uygun id gider', () => {
    expect(filterApplicable('approve', units)).toEqual(['b'])
    expect(filterApplicable('complete', units)).toEqual(['a', 'b'])
    expect(filterApplicable('revert', units)).toEqual(['c'])
  })
})

describe('revertConfirmMessage', () => {
  it('dokümandaki onay metnini üretir', () => {
    expect(revertConfirmMessage(7)).toBe(
      '7 çalışmanın tamamlanma kaydı geri alınacak. Devam edilsin mi?'
    )
  })
})
