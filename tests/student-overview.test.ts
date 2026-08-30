import { describe, expect, it } from 'vitest'
import {
  summarizeAcademicFlow,
  summarizeProtectionPool,
  summarizeResourcePlan,
  type FlowSummaryItem,
  type PoolSummaryItem,
  type ResourceSummaryItem,
} from '@/lib/student-overview'

// R5.5 kabul testleri OG-01 … OG-08.
// (OG-09 ve OG-10 ekran düzeyinde: mevcut R4 kartları ve link hedefleri.)

const BUGUN = '2026-10-15'

function flowItem(over: Partial<FlowSummaryItem> & { topicId: string }): FlowSummaryItem {
  return {
    topicName: over.topicId,
    scopeId: 'tyt-mat',
    scopeName: 'TYT Matematik',
    startDate: '2026-10-01',
    endDate: '2026-10-21',
    passed: false,
    ...over,
  }
}

describe('summarizeAcademicFlow', () => {
  it('OG-01: zamanı gelmiş konuyu gösterir', () => {
    const ozet = summarizeAcademicFlow(
      [
        flowItem({ topicId: 'Sayılar', startDate: '2026-09-01', endDate: '2026-09-28', passed: true }),
        flowItem({ topicId: 'Fonksiyonlar', startDate: '2026-09-29', endDate: '2026-10-19' }),
      ],
      BUGUN
    )
    expect(ozet.current?.topicName).toBe('Fonksiyonlar')
  })

  it('OG-02: sıradaki yaklaşan konuyu gösterir', () => {
    const ozet = summarizeAcademicFlow(
      [
        flowItem({ topicId: 'Fonksiyonlar', startDate: '2026-09-29', endDate: '2026-10-19' }),
        flowItem({ topicId: 'Polinomlar', startDate: '2026-10-20', endDate: '2026-11-02' }),
        flowItem({ topicId: 'Trigonometri', startDate: '2026-11-03', endDate: '2026-11-23' }),
      ],
      BUGUN
    )
    expect(ozet.current?.topicName).toBe('Fonksiyonlar')
    expect(ozet.upcoming?.topicName).toBe('Polinomlar') // en yakın, Trigonometri değil
  })

  it('Geçildi konular özeti doldurmaz', () => {
    const ozet = summarizeAcademicFlow(
      [
        flowItem({ topicId: 'Sayılar', startDate: '2026-09-01', endDate: '2026-09-28', passed: true }),
        flowItem({ topicId: 'Kümeler', startDate: '2026-09-10', endDate: '2026-09-30', passed: true }),
      ],
      BUGUN
    )
    // Hepsi geçilmiş: gösterilecek aktif ya da yaklaşan konu yok.
    expect(ozet.current).toBeNull()
    expect(ozet.upcoming).toBeNull()
  })

  it('geçilmiş konu, zamanı gelmiş gibi görünmez', () => {
    const ozet = summarizeAcademicFlow(
      [
        flowItem({ topicId: 'Sayılar', startDate: '2026-09-01', endDate: '2026-09-28', passed: true }),
        flowItem({ topicId: 'Polinomlar', startDate: '2026-11-01', endDate: '2026-11-14' }),
      ],
      BUGUN
    )
    expect(ozet.current).toBeNull()
    expect(ozet.upcoming?.topicName).toBe('Polinomlar')
  })

  it('OG-08: çok scope varsa tek ders üzerinden sade özet verir', () => {
    const ozet = summarizeAcademicFlow(
      [
        flowItem({
          topicId: 'Vektörler',
          scopeId: 'ayt-fizik',
          scopeName: 'AYT Fizik',
          startDate: '2026-12-01',
          endDate: '2026-12-21',
        }),
        flowItem({ topicId: 'Fonksiyonlar', startDate: '2026-09-29', endDate: '2026-10-19' }),
      ],
      BUGUN
    )

    // Zamanı gelmiş konusu olan ders öncelikli.
    expect(ozet.scopeName).toBe('TYT Matematik')
    expect(ozet.current?.topicName).toBe('Fonksiyonlar')
    // Diğer dersin varlığı bilgi olarak duruyor ama kart uzamıyor.
    expect(ozet.otherScopeCount).toBe(1)
    // Başka dersin konusu bu kartta görünmez.
    expect(ozet.upcoming?.topicName).not.toBe('Vektörler')
  })

  it('zamanı gelmiş ders yoksa en yakın başlayacak ders seçilir', () => {
    const ozet = summarizeAcademicFlow(
      [
        flowItem({
          topicId: 'Vektörler',
          scopeId: 'ayt-fizik',
          scopeName: 'AYT Fizik',
          startDate: '2026-11-01',
          endDate: '2026-11-21',
        }),
        flowItem({ topicId: 'Limit', startDate: '2026-12-01', endDate: '2026-12-21' }),
      ],
      BUGUN
    )
    expect(ozet.scopeName).toBe('AYT Fizik')
    expect(ozet.upcoming?.topicName).toBe('Vektörler')
  })

  it('OG-07: akış yoksa kırılmaz, nötr boş sonuç döner', () => {
    const ozet = summarizeAcademicFlow([], BUGUN)
    expect(ozet.current).toBeNull()
    expect(ozet.upcoming).toBeNull()
    expect(ozet.scopeName).toBeNull()
    expect(ozet.otherScopeCount).toBe(0)
  })
})

describe('summarizeResourcePlan', () => {
  function res(over: Partial<ResourceSummaryItem> & { bookId: string }): ResourceSummaryItem {
    return {
      title: over.bookId,
      group: 'active',
      planPercentage: 0,
      bookPercentage: 0,
      ...over,
    }
  }

  it('OG-03: aktif kaynakların ilerlemesini özetler', () => {
    const ozet = summarizeResourcePlan([
      res({ bookId: 'A', planPercentage: 80 }),
      res({ bookId: 'B', planPercentage: 40 }),
    ])
    expect(ozet.activeCount).toBe(2)
    expect(ozet.averagePlanPercentage).toBe(60)
  })

  it("OG-04: kart Plan %100'u esas alır, Kitap %66'yı değil", () => {
    const ozet = summarizeResourcePlan([
      res({ bookId: '345 Matematik', planPercentage: 100, bookPercentage: 66 }),
    ])
    expect(ozet.averagePlanPercentage).toBe(100)
    expect(ozet.topActive[0].planPercentage).toBe(100)
    // Kitap % veri olarak duruyor ama ana gösterge değil.
    expect(ozet.topActive[0].bookPercentage).toBe(66)
  })

  it('OG-05: bekleyen ve tamamlanan kaynaklar ayrı sayılır', () => {
    const ozet = summarizeResourcePlan([
      res({ bookId: 'A', group: 'active', planPercentage: 50 }),
      res({ bookId: 'B', group: 'pending' }),
      res({ bookId: 'C', group: 'pending' }),
      res({ bookId: 'D', group: 'completed', planPercentage: 100 }),
    ])
    expect(ozet.activeCount).toBe(1)
    expect(ozet.pendingCount).toBe(2)
    expect(ozet.completedCount).toBe(1)
    // Ortalama yalnız aktif kaynaklardan hesaplanır.
    expect(ozet.averagePlanPercentage).toBe(50)
  })

  it('en düşük ilerlemeli aktif kaynaklar önce gelir', () => {
    const ozet = summarizeResourcePlan([
      res({ bookId: 'A', planPercentage: 90 }),
      res({ bookId: 'B', planPercentage: 20 }),
      res({ bookId: 'C', planPercentage: 55 }),
    ])
    expect(ozet.topActive.map(r => r.bookId)).toEqual(['B', 'C', 'A'])
  })

  it('kart en fazla birkaç kaynak gösterir', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      res({ bookId: `K${i}`, planPercentage: i * 10 })
    )
    expect(summarizeResourcePlan(items).topActive).toHaveLength(3)
  })

  it('OG-07: kaynak yoksa kırılmaz', () => {
    const ozet = summarizeResourcePlan([])
    expect(ozet.activeCount).toBe(0)
    expect(ozet.averagePlanPercentage).toBeNull()
    expect(ozet.topActive).toEqual([])
  })
})

describe('summarizeProtectionPool', () => {
  function pool(n: number): PoolSummaryItem[] {
    return Array.from({ length: n }, (_, i) => ({
      topicId: `t${i}`,
      topicName: `Konu ${i}`,
      daysSinceContact: 100 - i,
    }))
  }

  it("OG-06: havuzda 8 konu varsa kart yalnız en eski 3'ünü gösterir", () => {
    const ozet = summarizeProtectionPool(pool(8))
    expect(ozet.top).toHaveLength(3)
    expect(ozet.total).toBe(8)
    expect(ozet.top[0].daysSinceContact).toBe(100)
  })

  it("3'ten az konu varsa hepsi gösterilir", () => {
    const ozet = summarizeProtectionPool(pool(2))
    expect(ozet.top).toHaveLength(2)
    expect(ozet.total).toBe(2)
  })

  it('OG-07: havuz boşsa kırılmaz', () => {
    const ozet = summarizeProtectionPool([])
    expect(ozet.top).toEqual([])
    expect(ozet.total).toBe(0)
  })
})
