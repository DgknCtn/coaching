import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calculatePlanPace } from '@/lib/plan-pace'
import { defaultHomeworkTitle, targetWeekNumber } from '@/lib/homework-title'
import type { FlowRef } from '@/lib/open-homework'

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

describe('EK-08 · haftalık ödev başlığı', () => {
  const flow = (id: string, startsAt: string, weekNo: number | null, status: 'active' | 'closed'): FlowRef => ({
    id,
    startsAt,
    dueAt: startsAt,
    status,
    weekNo,
  })
  const flows = [
    flow('f1', '2026-09-28T07:00:00Z', 1, 'closed'),
    flow('f6', '2026-11-02T07:00:00Z', 6, 'active'),
  ]

  it('aktif haftaya ekleme numarayı artırmaz → "6. Hafta Ödevi"', () => {
    const n = targetWeekNumber({ flows, activeFlowId: 'f6', needsTransition: false })
    expect(n).toBe(6)
    expect(defaultHomeworkTitle(n)).toBe('6. Hafta Ödevi')
  })

  it('yeni hafta: önceki + 1 (Pazar günü açılsa da bugünün numarasını almaz)', () => {
    const sunday = new Date('2026-11-08T15:00:00Z') // 6. haftanın Pazarı
    expect(targetWeekNumber({ flows, activeFlowId: 'f6', needsTransition: true, today: sunday })).toBe(7)
  })

  it('yeni hafta bugünün haftasından geri kalmaz (aradan hafta geçtiyse)', () => {
    const later = new Date('2026-11-25T10:00:00Z') // 9. hafta
    expect(targetWeekNumber({ flows, activeFlowId: null, needsTransition: true, today: later })).toBe(9)
  })

  it('hiç hafta yoksa numara uydurulmaz', () => {
    expect(targetWeekNumber({ flows: [], activeFlowId: null, needsTransition: true })).toBeNull()
    expect(defaultHomeworkTitle(null)).toBeNull()
  })

  it('builder taslağa yalnız elle girilen başlığı yazar, yayında öneriyi kullanır', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/(dashboard)/teacher/students/[studentId]/homework/new/homework-builder.tsx'),
      'utf8'
    )
    expect(src).toMatch(/effectiveTitle \|\| undefined/)
    expect(src).toMatch(/useState\(initialTitle !== ''\)/)
  })
})

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
