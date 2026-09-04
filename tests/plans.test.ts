import { describe, expect, it } from 'vitest'
import {
  BLOCKED_MESSAGE,
  PLANS,
  TRIAL_DAYS,
  evaluateQuota,
  trialDaysLeft,
  type WorkspaceUsage,
} from '@/lib/plans'

// Plan ve kota mantığı (Faz 4).
//
// Bu sayılar FATURAYA dönüşecek. Yanlış hesaplanan bir kota ya müşteriyi
// haksız yere engeller ya da ödemediği kadarını kullandırır; ikisi de
// sessizce olur. Sınır davranışları burada kilitleniyor.

const usage = (over: Partial<WorkspaceUsage> = {}): WorkspaceUsage => ({
  plan: 'coach',
  studentLimit: 30,
  activeStudents: 0,
  trialEndsAt: null,
  ...over,
})

describe('PLANS · tanımlar', () => {
  it('vitrindeki dört kademeyi kapsar', () => {
    expect(Object.keys(PLANS).sort()).toEqual(['coach', 'institution', 'starter', 'trial'])
  })

  it('limitler pazarlama sayfasıyla tutarlı', () => {
    // Vitrin 10 / 30 / sınırsız diyor; kod ile vitrinin ayrışması
    // müşteriye verilen sözün bozulması demek.
    expect(PLANS.starter.studentLimit).toBe(10)
    expect(PLANS.coach.studentLimit).toBe(30)
    expect(PLANS.institution.studentLimit).toBeNull()
  })

  it('deneme, ödenecek kademeyle aynı sınırı gösterir', () => {
    expect(PLANS.trial.studentLimit).toBe(PLANS.starter.studentLimit)
  })

  it('deneme süresi 14 gün', () => {
    expect(TRIAL_DAYS).toBe(14)
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
    // Limit sonradan düşürülmüş olabilir (plan değişikliği); mevcut
    // öğrenciler silinmez, kalan sıfırda durur.
    const q = evaluateQuota(usage({ activeStudents: 35 }))
    expect(q.remaining).toBe(0)
    expect(q.usedPercentage).toBe(100)
    expect(q.canAddStudent).toBe(false)
  })

  it('%80 ve üstünde uyarı verir', () => {
    expect(evaluateQuota(usage({ activeStudents: 23 })).isNearLimit).toBe(false)
    expect(evaluateQuota(usage({ activeStudents: 24 })).isNearLimit).toBe(true)
  })

  it('sınırsız planda çubuk ve kalan gösterilmez', () => {
    // Dolmayan bir ilerleme çubuğu göstermek yanıltıcı olurdu.
    const q = evaluateQuota(usage({ plan: 'institution', studentLimit: null, activeStudents: 500 }))
    expect(q.canAddStudent).toBe(true)
    expect(q.remaining).toBeNull()
    expect(q.usedPercentage).toBeNull()
    expect(q.isNearLimit).toBe(false)
  })
})

describe('trialDaysLeft', () => {
  const now = new Date('2026-09-04T12:00:00Z')

  it('kalan günü yukarı yuvarlar', () => {
    // Bugün bitecek deneme "0 gün" değil "son gün" olarak görünmeli.
    expect(trialDaysLeft('2026-09-04T23:00:00Z', now)).toBe(1)
    expect(trialDaysLeft('2026-09-18T12:00:00Z', now)).toBe(14)
  })

  it('süresi dolmuşsa sıfır döner', () => {
    expect(trialDaysLeft('2026-09-04T11:59:00Z', now)).toBe(0)
    expect(trialDaysLeft('2026-08-01T00:00:00Z', now)).toBe(0)
  })

  it('deneme yoksa null döner', () => {
    expect(trialDaysLeft(null, now)).toBeNull()
    expect(trialDaysLeft('bozuk-tarih', now)).toBeNull()
  })
})

describe('BLOCKED_MESSAGE', () => {
  it('üç engel nedeninin de mesajı var', () => {
    expect(Object.keys(BLOCKED_MESSAGE).sort()).toEqual([
      'archived',
      'suspended',
      'trial_expired',
    ])
  })

  it('öğrenci ve veliye fatura dili kurulmaz', () => {
    // Deneme bitince öğrenci de kilitleniyor ama ödemeyle ilgisi yok;
    // ona "plan seçin" demek anlamsız ve kırıcı olurdu.
    for (const reason of ['trial_expired', 'suspended'] as const) {
      const other = BLOCKED_MESSAGE[reason].other
      expect(other).not.toMatch(/plan|ödeme|fatura|abonelik/i)
      expect(other).toMatch(/öğretmen/i)
    }
  })
})
