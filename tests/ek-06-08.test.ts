import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calculatePlanPace } from '@/lib/plan-pace'

// İz Son Ek Revizyonlar · 08.11.2026 — madde kodlarıyla.

describe('EK-07 · liste için kısa plan farkı (detayla aynı hesap)', () => {
  const base = {
    startDate: '2026-09-01',
    targetEndDate: '2026-12-31',
    totalUnits: 120,
    today: new Date('2026-10-31T12:00:00Z'),
  }

  it('önde / geride / plan çizgisinde — birim takip türünden', () => {
    const expected = calculatePlanPace({ ...base, completedUnits: 0 }).expectedCompletedUnits
    expect(calculatePlanPace({ ...base, completedUnits: expected + 10, trackingMode: 'page' }).shortPhrase).toBe(
      '10 sayfa önde'
    )
    expect(calculatePlanPace({ ...base, completedUnits: expected - 5, trackingMode: 'test' }).shortPhrase).toBe(
      '5 test geride'
    )
    expect(calculatePlanPace({ ...base, completedUnits: expected, trackingMode: 'page' }).shortPhrase).toBe(
      'Plan çizgisinde'
    )
  })

  it('uzun ifade ile kısa ifade aynı farkı söyler', () => {
    const r = calculatePlanPace({ ...base, completedUnits: 70, trackingMode: 'page' })
    expect(r.phrase).toContain(`${Math.abs(r.delta)} sayfa`)
    expect(r.shortPhrase).toContain(`${Math.abs(r.delta)} sayfa`)
  })

  it('hesaplanamayan fark sıfır sayılmaz', () => {
    expect(calculatePlanPace({ ...base, targetEndDate: null, completedUnits: 0 }).shortPhrase).toBeNull()
    expect(
      calculatePlanPace({ ...base, startDate: '2026-12-01', completedUnits: 0 }).shortPhrase
    ).toBeNull()
    expect(calculatePlanPace({ ...base, totalUnits: 0, completedUnits: 0 }).shortPhrase).toBeNull()
  })
})

// EK-08 (hafta numaralı başlık) Revize Mini 05 ile kaldırıldı — bkz. tests/revize-mini-05-06.test.ts.

describe('EK-06 · aylık ekrandan oturum ekleme', () => {
  it('aylık görünüm haftalıkla aynı formu ve hedefi kullanır', () => {
    const month = readFileSync(join(process.cwd(), 'components/sessions/month-sessions.tsx'), 'utf8')
    const client = readFileSync(
      join(process.cwd(), 'app/(dashboard)/teacher/students/[studentId]/gorusmeler/sessions-client.tsx'),
      'utf8'
    )
    expect(month).toMatch(/<AddSessionDialog/)
    expect(month).toMatch(/Oturum ekle/)
    expect(month).toMatch(/Ek ders ekle/)
    expect(client.match(/addSession=\{addSession\}/g)?.length).toBe(2)
  })
})
