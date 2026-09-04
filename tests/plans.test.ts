import { describe, expect, it } from 'vitest'
import {
  BLOCKED_MESSAGE,
  LICENSE_STATE_LABEL,
  PLAN_LABEL,
  TRIAL_DAYS,
  daysLeft,
  evaluateQuota,
  licenseState,
  trialDaysLeft,
  type WorkspaceUsage,
} from '@/lib/plans'

// Lisans ve kota mantığı (058).
//
// Bu sayılar FATURAYA dönüşecek. Yanlış hesaplanan bir kota ya müşteriyi
// haksız yere engeller ya da ödemediği kadarını kullandırır; ikisi de
// sessizce olur. Sınır davranışları burada kilitleniyor.

const usage = (over: Partial<WorkspaceUsage> = {}): WorkspaceUsage => ({
  plan: 'licensed',
  studentLimit: 30,
  activeStudents: 0,
  trialEndsAt: null,
  licenseStartsAt: null,
  licenseEndsAt: null,
  licenseStatus: null,
  ...over,
})

describe('TRIAL_DAYS', () => {
  it('deneme süresi 7 gün', () => {
    // 058'de 14'ten 7'ye indirildi. Bu sayı SQL tarafında da yazılı
    // (create_teacher_workspace, INTERVAL '7 days'); ikisi birlikte
    // değişmeli.
    expect(TRIAL_DAYS).toBe(7)
  })
})

describe('PLAN_LABEL', () => {
  it('üç durumun da etiketi var', () => {
    expect(PLAN_LABEL.trial).toBeTruthy()
    expect(PLAN_LABEL.licensed).toBeTruthy()
    expect(PLAN_LABEL.institution).toBeTruthy()
  })
})

describe('evaluateQuota', () => {
  it('boş çalışma alanında tüm kota kullanılabilir', () => {
    const q = evaluateQuota(usage({ activeStudents: 0 }))
    expect(q.canAddStudent).toBe(true)
    expect(q.remaining).toBe(30)
    expect(q.usedPercentage).toBe(0)
  })

  it('tavana ulaşınca ekleme kapanır', () => {
    const q = evaluateQuota(usage({ activeStudents: 30 }))
    expect(q.canAddStudent).toBe(false)
    expect(q.atLimit).toBe(true)
    expect(q.remaining).toBe(0)
  })

  it('tavanın üstünde kalan eksiye düşmez', () => {
    // Limit sonradan düşmüş olabilir; mevcut öğrenciler silinmez,
    // kalan sıfırda durur.
    const q = evaluateQuota(usage({ activeStudents: 35 }))
    expect(q.remaining).toBe(0)
    expect(q.usedPercentage).toBe(100)
    expect(q.canAddStudent).toBe(false)
  })

  it('%80 ve üstünde uyarı verir', () => {
    expect(evaluateQuota(usage({ activeStudents: 23 })).isNearLimit).toBe(false)
    expect(evaluateQuota(usage({ activeStudents: 24 })).isNearLimit).toBe(true)
  })

  it('sınırsız çalışma alanında çubuk ve kalan gösterilmez', () => {
    // Dolmayan bir ilerleme çubuğu göstermek yanıltıcı olurdu.
    const q = evaluateQuota(
      usage({ plan: 'institution', studentLimit: null, activeStudents: 500 })
    )
    expect(q.canAddStudent).toBe(true)
    expect(q.remaining).toBeNull()
    expect(q.usedPercentage).toBeNull()
    expect(q.isNearLimit).toBe(false)
  })
})

describe('daysLeft', () => {
  const now = new Date('2026-09-04T12:00:00Z')

  it('kalan günü yukarı yuvarlar', () => {
    // Bugün bitecek süre "0 gün" değil "son gün" olarak görünmeli.
    expect(daysLeft('2026-09-04T23:00:00Z', now)).toBe(1)
    expect(daysLeft('2026-09-11T12:00:00Z', now)).toBe(7)
  })

  it('süresi dolmuşsa sıfır döner', () => {
    expect(daysLeft('2026-09-04T11:59:00Z', now)).toBe(0)
    expect(daysLeft('2026-08-01T00:00:00Z', now)).toBe(0)
  })

  it('tarih yoksa null döner', () => {
    expect(daysLeft(null, now)).toBeNull()
    expect(daysLeft('bozuk-tarih', now)).toBeNull()
  })

  it('trialDaysLeft aynı fonksiyon', () => {
    expect(trialDaysLeft('2026-09-11T12:00:00Z', now)).toBe(7)
  })
})

describe('licenseState', () => {
  const now = new Date('2026-09-04T12:00:00Z')

  it('deneme sürüyor', () => {
    expect(
      licenseState(usage({ plan: 'trial', trialEndsAt: '2026-09-08T12:00:00Z' }), now)
    ).toBe('trialing')
  })

  it('deneme doldu', () => {
    expect(
      licenseState(usage({ plan: 'trial', trialEndsAt: '2026-09-01T12:00:00Z' }), now)
    ).toBe('trial_expired')
  })

  it('lisans aktif', () => {
    expect(
      licenseState(usage({ plan: 'licensed', licenseEndsAt: '2026-12-01T12:00:00Z' }), now)
    ).toBe('licensed')
  })

  it('lisans doldu', () => {
    expect(
      licenseState(usage({ plan: 'licensed', licenseEndsAt: '2026-08-01T12:00:00Z' }), now)
    ).toBe('license_expired')
  })

  it('lisansı hiç olmayan "licensed" kiracı süresi dolmuş sayılır', () => {
    // Ödeme kaydı silinmiş ya da callback yarım kalmış olabilir.
    // "Aktif" varsaymak, ödemeyen kiracıya erişim vermek olurdu.
    expect(licenseState(usage({ plan: 'licensed', licenseEndsAt: null }), now)).toBe(
      'license_expired'
    )
  })

  it('devralınan kiracı sınırsız', () => {
    // 052'de grandfathered edilenler: ne denemede ne lisanslı.
    // Kapıda bırakılmamalılar.
    expect(licenseState(usage({ plan: 'institution' }), now)).toBe('unlimited')
  })

  it('her durumun etiketi var', () => {
    for (const state of [
      'trialing',
      'trial_expired',
      'licensed',
      'license_expired',
      'unlimited',
    ] as const) {
      expect(LICENSE_STATE_LABEL[state]).toBeTruthy()
    }
  })
})

describe('BLOCKED_MESSAGE', () => {
  it('dört engel nedeninin de mesajı var', () => {
    expect(Object.keys(BLOCKED_MESSAGE).sort()).toEqual([
      'archived',
      'license_expired',
      'suspended',
      'trial_expired',
    ])
  })

  it('öğrenci ve veliye fatura dili kurulmaz', () => {
    // Süre bitince öğrenci de kilitleniyor ama ödemeyle ilgisi yok;
    // ona "lisans alın" demek anlamsız ve kırıcı olurdu.
    for (const reason of ['trial_expired', 'license_expired', 'suspended'] as const) {
      const other = BLOCKED_MESSAGE[reason].other
      expect(other).not.toMatch(/lisans|ödeme|fatura|abonelik|plan/i)
      expect(other).toMatch(/öğretmen/i)
    }
  })

  it('deneme mesajı gün sayısını koddan alır', () => {
    // Metne "14 gün" elle yazılmıştı; TRIAL_DAYS değişince metin
    // sessizce yanlış olmuştu.
    expect(BLOCKED_MESSAGE.trial_expired.teacher).toContain(`${TRIAL_DAYS} günlük`)
  })
})
