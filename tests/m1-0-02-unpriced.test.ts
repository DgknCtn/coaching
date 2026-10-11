import { describe, expect, it } from 'vitest'

import { findUnpricedSessions } from '@/app/(dashboard)/teacher/students/[studentId]/gorusmeler/load'
import type { SessionRow } from '@/app/(dashboard)/teacher/students/[studentId]/gorusmeler/types'

// "Fiyatsız" uyarısı (M1.0-02): Yapıldı ama ücret doğmamış oturum.
// Kural 141'deki tahakkuk kuralının aynası; yanlış pozitif öğretmeni
// gereksiz yere fiyat girmeye, yanlış negatif ise borcu kaçırmaya iter.

function session(over: Partial<SessionRow>): SessionRow {
  return {
    id: 's1',
    studentId: 'ogr',
    serviceId: 'svc',
    plannedAt: '2026-10-03T12:00:00Z',
    currentPlannedAt: '2026-10-03T12:00:00Z',
    actualAt: '2026-10-03T12:00:00Z',
    durationMinutes: 120,
    unitCount: 1,
    status: 'yapildi',
    attended: null,
    note: null,
    cancelReason: null,
    groupSessionId: null,
    isMakeup: false,
    isExtra: false,
    source: 'elle',
    makeupDecision: null,
    makeupStatus: 'none',
    originPlannedAt: null,
    ...over,
  }
}

const dersBasi = [{ model: 'ders_basi' as const, collectionTiming: 'ay_sonu' as const, validFrom: '2026-03-01' }]
const aylik = [{ model: 'aylik_sabit' as const, collectionTiming: 'ay_basi' as const, validFrom: '2026-10-01' }]

function run(sessions: SessionRow[], link: 'aylik_paket' | 'ders_basi' | 'haric', models: typeof dersBasi | typeof aylik | [], accrued: string[] = []) {
  return findUnpricedSessions({
    sessions,
    financeLinkByService: new Map([['svc', link]]),
    modelsByStudent: new Map([['ogr', models]]),
    accruedSessionIds: new Set(accrued),
  })
}

describe('fiyatsız oturum', () => {
  it('ders başı modelde tahakkuku olmayan yapılmış ders fiyatsızdır', () => {
    expect(run([session({})], 'aylik_paket', dersBasi)).toEqual(['s1'])
  })

  it('tahakkuku varsa uyarı yok', () => {
    expect(run([session({})], 'aylik_paket', dersBasi, ['s1'])).toEqual([])
  })

  it('aylık sabitte modele dahil ders ücret beklemez; ek ders bekler', () => {
    expect(run([session({})], 'aylik_paket', aylik)).toEqual([])
    expect(run([session({ isExtra: true })], 'aylik_paket', aylik)).toEqual(['s1'])
  })

  it('takip dışı, planlı, katılmadı ve modelsiz "modele dahil" uyarı vermez', () => {
    expect(run([session({})], 'haric', dersBasi)).toEqual([])
    expect(run([session({ status: 'planlandi' })], 'aylik_paket', dersBasi)).toEqual([])
    expect(run([session({ attended: false })], 'aylik_paket', dersBasi)).toEqual([])
    expect(run([session({})], 'aylik_paket', [])).toEqual([])
  })

  it('model, gerçekleşme tarihine göre okunur', () => {
    // Model 1 Ekim'de başlıyor; Eylül dersi aylık sabit değil → modelsiz.
    expect(run([session({ actualAt: '2026-09-20T12:00:00Z', isExtra: true })], 'aylik_paket', aylik)).toEqual([])
  })
})
