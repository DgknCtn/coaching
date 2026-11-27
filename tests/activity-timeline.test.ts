import { describe, expect, it } from 'vitest'
import { buildTimeline, groupByDay, type TimelineSources } from '@/lib/activity-timeline'

// Faz 2c · Aktivite zaman tüneli — yalnız var olan kayıtlar, yorum yok.

const empty: TimelineSources = { batches: [], items: [], sessions: [], checkIns: [], interventions: [], payments: [], notes: [] }

describe('buildTimeline', () => {
  it('aynı gün birim olayları tek satırda toplanır', () => {
    const ev = buildTimeline({
      ...empty,
      items: [
        { submitted_at: '2026-11-20T10:00:00Z', approved_at: null, rejected_at: null },
        { submitted_at: '2026-11-20T18:00:00Z', approved_at: '2026-11-21T09:00:00Z', rejected_at: null },
        { submitted_at: '2026-11-22T08:00:00Z', approved_at: null, rejected_at: null },
      ],
    })
    expect(ev.filter(e => e.kind === 'homework_submitted').map(e => e.title)).toEqual([
      '1 çalışma teslim edildi',
      '2 çalışma teslim edildi',
    ])
    expect(ev.find(e => e.kind === 'homework_approved')?.title).toBe('1 çalışma onaylandı')
  })

  it('yalnız sonucu girilmiş dersler; planlanan ders zaman tünelinde yok', () => {
    const ev = buildTimeline({
      ...empty,
      sessions: [
        { id: 'a', status: 'yapildi', actual_at: '2026-11-20T17:00:00Z', current_planned_at: null, planned_at: '2026-11-20T17:00:00Z', note: 'Türev tekrar' },
        { id: 'b', status: 'planlandi', actual_at: null, current_planned_at: null, planned_at: '2026-11-27T17:00:00Z', note: null },
        { id: 'c', status: 'iptal', actual_at: null, current_planned_at: '2026-11-23T17:00:00Z', planned_at: '2026-11-22T17:00:00Z', note: null },
      ],
    })
    expect(ev.map(e => e.kind)).toEqual(['lesson_cancelled', 'lesson_done'])
    expect(ev[1].detail).toBe('Türev tekrar')
  })

  it('en yeni önce; kategoriler doğru; ödeme tutarı TL', () => {
    const ev = buildTimeline({
      ...empty,
      notes: [{ id: 'n', created_at: '2026-11-25T09:00:00Z', note_text: 'Parçalı fonksiyonda zorlanıyor', pinned: true }],
      payments: [{ id: 'p', paid_on: '2026-11-24', amount_kurus: 240000, method: 'havale' }],
      batches: [{ id: 'b', title: 'Hafta 6', created_at: '2026-11-26T08:00:00Z', item_count: 9 }],
    })
    expect(ev.map(e => e.category)).toEqual(['akademik', 'not', 'odeme'])
    expect(ev[0].detail).toBe('Hafta 6 · 9 çalışma')
    expect(ev[1].title).toBe('Sabit not eklendi')
    expect(ev[2].title).toMatch(/2\.400/)
  })

  it('güne göre gruplama sırayı korur', () => {
    const ev = buildTimeline({
      ...empty,
      notes: [
        { id: '1', created_at: '2026-11-25T09:00:00Z', note_text: 'a', pinned: false },
        { id: '2', created_at: '2026-11-25T08:00:00Z', note_text: 'b', pinned: false },
        { id: '3', created_at: '2026-11-24T08:00:00Z', note_text: 'c', pinned: false },
      ],
    })
    expect(groupByDay(ev).map(d => [d.day, d.events.length])).toEqual([['2026-11-25', 2], ['2026-11-24', 1]])
  })
})
