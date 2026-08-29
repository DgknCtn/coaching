import { describe, expect, it } from 'vitest'
import { groupTasksByStudent, taskGroupLabel, type TaskRowLike } from '@/lib/task-grouping'

// R6-09 kabul testleri 55-58.

function row(over: Partial<TaskRowLike> & { id: string }): TaskRowLike {
  return {
    studentId: 's1',
    studentName: 'Ömer',
    batchId: 'b1',
    batchTitle: 'Hafta 12',
    dueDate: '2026-08-30',
    bookId: 'k1',
    bookTitle: '345 Matematik',
    trackingMode: 'test',
    ...over,
  }
}

describe('groupTasksByStudent', () => {
  it('kabul #55: aynı kitap iki farklı ödevde ayrı gruplar oluşturur', () => {
    const groups = groupTasksByStudent([
      row({ id: '1', batchId: 'b1', batchTitle: 'Hafta 12' }),
      row({ id: '2', batchId: 'b2', batchTitle: 'Hafta 13' }),
      row({ id: '3', batchId: 'b1', batchTitle: 'Hafta 12' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].books).toHaveLength(2)
    expect(groups[0].books.map(b => b.batchTitle)).toEqual(['Hafta 12', 'Hafta 13'])
    expect(groups[0].books[0].rows.map(r => r.id)).toEqual(['1', '3'])
    expect(groups[0].count).toBe(3)
  })

  it('farklı öğrenciler ayrı bloklara düşer', () => {
    const groups = groupTasksByStudent([
      row({ id: '1', studentId: 's1', studentName: 'Ömer' }),
      row({ id: '2', studentId: 's2', studentName: 'Elif' }),
      row({ id: '3', studentId: 's1', studentName: 'Ömer' }),
    ])

    expect(groups.map(g => g.studentName)).toEqual(['Ömer', 'Elif'])
    expect(groups[0].count).toBe(2)
    expect(groups[1].count).toBe(1)
  })

  it('aynı ödevdeki farklı kitaplar ayrışır', () => {
    const groups = groupTasksByStudent([
      row({ id: '1', bookId: 'k1', bookTitle: '345 Matematik' }),
      row({ id: '2', bookId: 'k2', bookTitle: 'MÖF Matematik' }),
    ])
    expect(groups[0].books.map(b => b.bookTitle)).toEqual(['345 Matematik', 'MÖF Matematik'])
  })

  it('sunucudan gelen sıra korunur', () => {
    const groups = groupTasksByStudent([
      row({ id: '3' }),
      row({ id: '1' }),
      row({ id: '2' }),
    ])
    expect(groups[0].books[0].rows.map(r => r.id)).toEqual(['3', '1', '2'])
  })

  it('boş girdi boş liste üretir', () => {
    expect(groupTasksByStudent([])).toEqual([])
  })
})

describe('taskGroupLabel', () => {
  it('ödev başlığı varsa onu kullanır', () => {
    expect(
      taskGroupLabel({ batchTitle: 'Hafta 12', dueDate: '2026-08-30', bookTitle: 'MÖF' })
    ).toBe('Hafta 12 · MÖF')
  })

  it('başlık yoksa teslim tarihine düşer', () => {
    expect(taskGroupLabel({ batchTitle: null, dueDate: '2026-08-30', bookTitle: 'MÖF' })).toBe(
      '30.08.2026 · MÖF'
    )
  })

  it('ikisi de yoksa nötr etiket kullanır', () => {
    expect(taskGroupLabel({ batchTitle: '  ', dueDate: null, bookTitle: 'MÖF' })).toBe('Ödev · MÖF')
  })
})
