import { describe, it, expect } from 'vitest'
import {
  deriveBatchState,
  isOpenBatch,
  batchStateLabel,
  type BatchItemInput,
} from '@/lib/homework-status'

// Sabit "bugün": gecikme kararı Europe/Istanbul takvimine bağlı
// (APP_TIME_ZONE), bu yüzden testler kendi bugünlerini enjekte ediyor.
const TODAY = new Date('2026-03-10T09:00:00+03:00')
const PAST = '2026-03-01'
const FUTURE = '2026-03-20'

function items(...list: BatchItemInput[]): BatchItemInput[] {
  return list
}

describe('deriveBatchState · kaybolan ödev', () => {
  // ASIL HATA: vadesi geçmiş ama bütün kalemleri onaya gönderilmiş grup
  // eski filtrede ("tarihi geçmiş VE içinde pending var") hiçbir listeye
  // girmiyor, ekrandan tamamen kayboluyordu.
  it('vadesi geçmiş + tümü onayda → onay bekliyor, kaybolmaz', () => {
    const state = deriveBatchState({
      dueDate: PAST,
      items: items({ status: 'pending_approval' }, { status: 'pending_approval' }),
      today: TODAY,
    })
    expect(state).toBe('pending_approval')
  })

  // İKİNCİ KAYIP: öğretmenin iade ettiği ödev. rejected_at dolu ama
  // status 'pending' olduğu için eski filtrede gecikmiş sayılıyordu;
  // gecikmemişse hiç görünmüyordu.
  it('vadesi gelmemiş + iade edilmiş → düzeltme istenen', () => {
    const state = deriveBatchState({
      dueDate: FUTURE,
      items: items({ status: 'pending', rejected_at: '2026-03-08T10:00:00Z' }),
      today: TODAY,
    })
    expect(state).toBe('returned')
  })

  it('vadesi geçmiş + iade edilmiş → gecikme öne geçer', () => {
    // deriveTestState ile AYNI öncelik: overdue, returned'ın önünde.
    const state = deriveBatchState({
      dueDate: PAST,
      items: items({ status: 'pending', rejected_at: '2026-03-08T10:00:00Z' }),
      today: TODAY,
    })
    expect(state).toBe('overdue')
  })
})

describe('deriveBatchState · öncelik sırası', () => {
  it('açık kalem varsa onay bekleyen kalemler durumu değiştirmez', () => {
    const state = deriveBatchState({
      dueDate: FUTURE,
      items: items({ status: 'pending' }, { status: 'pending_approval' }),
      today: TODAY,
    })
    expect(state).toBe('assigned')
  })

  it('vadesi geçmiş + açık kalem → geciken', () => {
    const state = deriveBatchState({
      dueDate: PAST,
      items: items({ status: 'pending' }, { status: 'completed' }),
      today: TODAY,
    })
    expect(state).toBe('overdue')
  })

  it('tümü tamamlanmış → tamamlandı', () => {
    const state = deriveBatchState({
      dueDate: PAST,
      items: items({ status: 'completed' }, { status: 'completed' }),
      today: TODAY,
    })
    expect(state).toBe('completed')
  })

  it('vadesi olmayan grup gecikmiş sayılmaz', () => {
    const state = deriveBatchState({
      dueDate: null,
      items: items({ status: 'pending' }),
      today: TODAY,
    })
    expect(state).toBe('assigned')
  })
})

describe('deriveBatchState · sınır durumlar', () => {
  // İptal edilmiş kalem ne bekleyen iştir ne tamamlanmış; sayılmamalı.
  it('cancelled kalemler yok sayılır', () => {
    expect(
      deriveBatchState({
        dueDate: PAST,
        items: items({ status: 'cancelled' }, { status: 'completed' }),
        today: TODAY,
      })
    ).toBe('completed')
  })

  it('yalnız cancelled kalem varsa grup görünür kalır', () => {
    // Boş sayılır; "tamamlandı" demek yanlış olurdu.
    expect(
      deriveBatchState({
        dueDate: PAST,
        items: items({ status: 'cancelled' }),
        today: TODAY,
      })
    ).toBe('assigned')
  })

  it('kalemsiz grup kaybolmaz', () => {
    expect(deriveBatchState({ dueDate: PAST, items: [], today: TODAY })).toBe('assigned')
  })
})

describe('isOpenBatch · veli özeti bu soruyu soruyor', () => {
  it('öğrenciden eylem bekleyen durumlar açık sayılır', () => {
    expect(isOpenBatch('overdue')).toBe(true)
    expect(isOpenBatch('returned')).toBe(true)
    expect(isOpenBatch('assigned')).toBe(true)
  })

  // Onay bekleyen iş ÖĞRENCİNİN gecikmesi değil; veliye öyle
  // gösterilmemeli (rapor bulgusu 5).
  it('onay bekleyen ve tamamlanan açık sayılmaz', () => {
    expect(isOpenBatch('pending_approval')).toBe(false)
    expect(isOpenBatch('completed')).toBe(false)
  })
})

describe('batchStateLabel', () => {
  it('rol başına farklı dil kullanır', () => {
    expect(batchStateLabel('returned', 'student')).toBe('Düzeltme istenen')
    expect(batchStateLabel('returned', 'parent')).toBe('Geri gönderilen')
    expect(batchStateLabel('returned', 'teacher')).toBe('İade edilen')
  })
})
