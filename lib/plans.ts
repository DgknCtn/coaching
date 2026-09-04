// Plan tanımları ve kota mantığı (Faz 4).
//
// TEK DOĞRULUK KAYNAĞI DEĞİL — bilinçli. Uygulanan sayı veritabanındaki
// `workspaces.student_limit`'tir (052) ve tetikleyici onu okur. Buradaki
// değerler VARSAYILANLARDIR: yeni bir workspace açılırken hangi limitin
// yazılacağını ve arayüzde hangi etiketin gösterileceğini belirler.
//
// Ayrım şuna yarıyor: bir müşteriyle 40 öğrenci üzerinde anlaşıldığında
// planı "Koç" kalır, limiti tek satırlık bir UPDATE ile değişir. Limit
// kodda sabit olsaydı bu bir dağıtım gerektirirdi.

export type PlanId = 'trial' | 'starter' | 'coach' | 'institution'

export interface PlanDefinition {
  id: PlanId
  name: string
  /** Varsayılan aktif öğrenci tavanı. null = sınırsız. */
  studentLimit: number | null
  description: string
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  trial: {
    id: 'trial',
    name: 'Deneme',
    // Denemede sınır vitrindeki Başlangıç ile aynı: ürünü deneyen kişi,
    // ödeyeceği kademede ne bulacağını görmeli.
    studentLimit: 10,
    description: '14 gün boyunca ürünün tamamı',
  },
  starter: {
    id: 'starter',
    name: 'Başlangıç',
    studentLimit: 10,
    description: 'Yeni başlayan koçlar ve özel ders öğretmenleri',
  },
  coach: {
    id: 'coach',
    name: 'Koç',
    studentLimit: 30,
    description: 'Öğrenci portföyünü tek başına yöneten koçlar',
  },
  institution: {
    id: 'institution',
    name: 'Kurum',
    studentLimit: null,
    description: 'Kurs, dershane ve eğitim kurumları',
  },
}

/** Deneme süresi. Karar: 14 gün, bitince çalışma alanı tamamen kapanır. */
export const TRIAL_DAYS = 14

export interface WorkspaceUsage {
  plan: PlanId
  studentLimit: number | null
  activeStudents: number
  trialEndsAt: string | null
}

export interface QuotaState {
  /** Yeni öğrenci eklenebilir mi? */
  canAddStudent: boolean
  /** Sınırsız planlarda null. */
  remaining: number | null
  /** 0-100. Sınırsız planlarda null — dolmayan bir çubuk göstermek yanıltıcı. */
  usedPercentage: number | null
  /** Tavanın %80'i ve üstü: kullanıcı sürprizle karşılaşmadan önce uyarılmalı. */
  isNearLimit: boolean
  atLimit: boolean
}

export function evaluateQuota(usage: WorkspaceUsage): QuotaState {
  if (usage.studentLimit === null) {
    return {
      canAddStudent: true,
      remaining: null,
      usedPercentage: null,
      isNearLimit: false,
      atLimit: false,
    }
  }

  const remaining = Math.max(0, usage.studentLimit - usage.activeStudents)
  const usedPercentage = Math.min(
    100,
    Math.round((usage.activeStudents / usage.studentLimit) * 100)
  )

  return {
    canAddStudent: remaining > 0,
    remaining,
    usedPercentage,
    isNearLimit: usedPercentage >= 80,
    atLimit: remaining === 0,
  }
}

/**
 * Denemenin kalan günü.
 *
 * Gün SAYISI yukarı yuvarlanır: bugün bitecek bir deneme "0 gün kaldı"
 * değil "son gün" olarak görünmeli. Süresi dolmuşsa 0.
 */
export function trialDaysLeft(trialEndsAt: string | null, now: Date = new Date()): number | null {
  if (!trialEndsAt) return null

  const end = Date.parse(trialEndsAt)
  if (Number.isNaN(end)) return null

  const ms = end - now.getTime()
  if (ms <= 0) return 0

  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

/** Erişimin neden engellendiği. 052'deki blocked_reason ile aynı küme. */
export type BlockedReason = 'suspended' | 'archived' | 'trial_expired'

export const BLOCKED_MESSAGE: Record<
  BlockedReason,
  { title: string; teacher: string; other: string }
> = {
  trial_expired: {
    title: 'Deneme süreniz doldu',
    teacher:
      '14 günlük deneme süreniz sona erdi. Verilerinizin hiçbiri silinmedi; bir plan seçtiğinizde kaldığınız yerden devam edersiniz.',
    // Öğrenci ve veli ödemeyle ilgili değil; onlara fatura dili
    // kurulmaz, ne yapmaları gerektiği söylenir.
    other:
      'Öğretmeninizin çalışma alanı şu an erişime kapalı. Bilgileriniz duruyor; öğretmeninizle iletişime geçebilirsiniz.',
  },
  suspended: {
    title: 'Çalışma alanı askıya alındı',
    teacher:
      'Çalışma alanınız askıya alındı. Verileriniz duruyor. Devam etmek için bizimle iletişime geçin.',
    other:
      'Öğretmeninizin çalışma alanı şu an erişime kapalı. Bilgileriniz duruyor; öğretmeninizle iletişime geçebilirsiniz.',
  },
  archived: {
    title: 'Çalışma alanı arşivlendi',
    teacher: 'Bu çalışma alanı arşivlendi ve artık kullanılmıyor.',
    other: 'Öğretmeninizin çalışma alanı arşivlendi.',
  },
}
