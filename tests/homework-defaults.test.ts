import { describe, expect, it } from 'vitest'
import { dueFromNextSession, pickDefaultDue, suggestScopeForBook } from '@/lib/homework-defaults'

// "Ödev Verme Akışını Kısaltma" (26.11.2026) §4–§5: varsayılan son teslim
// asla geçmiş değil; kapanmamış hafta "bayat" olarak işaretlenir.

const now = new Date('2026-11-26T12:00:00+03:00')
const base = { draftDue: null, activeFlowDueAt: null, nextSession: null, anchor: null, now, today: '2026-11-26' }

describe('pickDefaultDue', () => {
  it('belgedeki vaka: kapanmamış eski hafta (22 Kasım) atlanır, sıradaki ders gelir, hafta bayat', () => {
    const r = pickDefaultDue({
      ...base,
      activeFlowDueAt: '2026-11-22T18:00:00+03:00',
      nextSession: { dueAt: '2026-11-28T10:00:00+03:00', serviceId: 's1' },
    })
    expect(r).toEqual({ dueAt: '2026-11-28T10:00:00+03:00', source: 'session', serviceId: 's1', stale: true })
  })

  it('ileri tarihli aktif hafta korunur', () => {
    const r = pickDefaultDue({ ...base, activeFlowDueAt: '2026-11-29T18:00:00+03:00' })
    expect(r).toMatchObject({ source: 'flow', stale: false })
  })

  it('geçmiş taslak tarihi atlanır; ileri taslak kazanır', () => {
    expect(pickDefaultDue({ ...base, draftDue: '2026-11-20' }).source).toBeNull()
    expect(pickDefaultDue({ ...base, draftDue: '2026-11-30' })).toMatchObject({ source: 'draft', dueAt: null })
    expect(pickDefaultDue({ ...base, draftDue: '2026-11-30T18:00:00+03:00' }).source).toBe('draft')
    expect(pickDefaultDue({ ...base, draftDue: '2026-11-26T09:00:00+03:00' }).source).toBeNull()
  })

  it('ders yoksa haftalık program, o da yoksa boş', () => {
    expect(pickDefaultDue({ ...base, anchor: { dueAt: '2026-11-30T09:00:00+03:00', serviceId: 'a' } })).toMatchObject({
      source: 'anchor',
      serviceId: 'a',
    })
    expect(pickDefaultDue(base)).toEqual({ dueAt: null, source: null, serviceId: null, stale: false })
  })

  it('hiçbir kaynaktan geçmiş tarih dönmez', () => {
    const r = pickDefaultDue({
      ...base,
      activeFlowDueAt: '2026-11-01T10:00:00+03:00',
      nextSession: { dueAt: '2026-11-25T10:00:00+03:00', serviceId: 's' },
      anchor: { dueAt: '2026-11-24T10:00:00+03:00', serviceId: 'a' },
    })
    expect(r).toEqual({ dueAt: null, source: null, serviceId: null, stale: true })
  })
})

describe('dueFromNextSession', () => {
  const offsets = new Map([['ders', 60], ['kocluk', 0]])
  it('ofset uygulanır; ana temas hizmeti tercih edilir', () => {
    const sessions = [
      { serviceId: 'ders', at: '2026-11-27T10:00:00+03:00' },
      { serviceId: 'kocluk', at: '2026-11-28T10:00:00+03:00' },
    ]
    expect(dueFromNextSession(sessions, offsets, 'kocluk', now)).toEqual({
      dueAt: new Date('2026-11-28T10:00:00+03:00').toISOString(),
      serviceId: 'kocluk',
    })
    expect(dueFromNextSession(sessions, offsets, null, now)).toEqual({
      dueAt: new Date('2026-11-27T09:00:00+03:00').toISOString(),
      serviceId: 'ders',
    })
  })
  it('ofset sonrası geçmişte kalan ders atlanır', () => {
    const sessions = [
      { serviceId: 'ders', at: '2026-11-26T12:30:00+03:00' },
      { serviceId: 'ders', at: '2026-12-03T12:30:00+03:00' },
    ]
    expect(dueFromNextSession(sessions, offsets, 'ders', now)?.dueAt).toBe(new Date('2026-12-03T11:30:00+03:00').toISOString())
  })
})

describe('suggestScopeForBook', () => {
  const scopes = [
    { id: 'tyt-mat', subject: 'Matematik', levelExam: 'TYT' },
    { id: 'ayt-mat', subject: 'Matematik', levelExam: 'AYT' },
    { id: 'fizik', subject: 'Fizik', levelExam: null },
  ]
  it('ders + düzey tekil eşleşme', () => {
    expect(suggestScopeForBook({ subject: 'matematik', levelExam: 'TYT' }, scopes)).toBe('tyt-mat')
  })
  it('yalnız ders tekil eşleşme', () => {
    expect(suggestScopeForBook({ subject: 'Fizik', levelExam: 'AYT' }, scopes)).toBe('fizik')
  })
  it('alanlar boşsa kapsam adından (kabul testi: "10. Sınıf Matematik")', () => {
    const named = [
      { id: 'b10', name: '10. Sınıf Biyoloji', subject: null, levelExam: null },
      { id: 'm10', name: '10. Sınıf Matematik', subject: null, levelExam: null },
      { id: 'm11', name: '11. Sınıf Matematik', subject: null, levelExam: null },
      { id: 'tyt', name: 'TYT Matematik', subject: null, levelExam: null },
    ]
    expect(suggestScopeForBook({ subject: 'Matematik', levelExam: '10. Sınıf' }, named)).toBe('m10')
    expect(suggestScopeForBook({ subject: 'Matematik', levelExam: 'TYT' }, named)).toBe('tyt')
    expect(suggestScopeForBook({ subject: 'Matematik', levelExam: 'TYT+AYT' }, named)).toBeNull()
    expect(suggestScopeForBook({ subject: 'Matematik', levelExam: null }, named)).toBeNull()
  })

  it('belirsiz ya da hiç eşleşme yoksa öneri yok', () => {
    expect(suggestScopeForBook({ subject: 'Matematik', levelExam: null }, scopes)).toBeNull()
    expect(suggestScopeForBook({ subject: 'Kimya', levelExam: 'TYT' }, scopes)).toBeNull()
    expect(suggestScopeForBook({ subject: null, levelExam: 'TYT' }, scopes)).toBeNull()
  })
})
