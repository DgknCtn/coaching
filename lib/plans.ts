// Lisans durumu ve kota mantığı.
//
// ============================================================
// PLAN KAVRAMI KALDIRILDI (058)
//
// Önceden Başlangıç/Koç/Kurum planları vardı ve her biri sabit bir
// öğrenci tavanı taşıyordu. Yeni modelde kullanıcı ÖĞRENCİ SAYISINI
// KENDİSİ SEÇİYOR; "plan" artık yalnız çalışma alanının hangi durumda
// olduğunu söyleyen bir etiket.
//
// Uygulanan sayı hâlâ veritabanındaki `workspaces.student_limit` ve
// `students` üzerindeki tetikleyici onu okuyor — fiyatlandırma
// değişse de bu kural değişmedi.
// ============================================================

/** Çalışma alanının faturalama durumu. */
export type PlanId = 'trial' | 'licensed' | 'institution'

export const PLAN_LABEL: Record<string, string> = {
  trial: 'Deneme',
  licensed: 'Plan aktif',
  institution: 'Kurumsal',
}

/**
 * `workspaces.status` karşılıkları.
 *
 * Yönetim paneli bu değerleri ham İngilizce basıyordu ('suspended',
 * 'archived'). Türkçe bir arayüzde ham enum göstermek, kullanıcıyı
 * veritabanı şemasını okumaya zorlar.
 */
export const WORKSPACE_STATUS_LABEL: Record<string, string> = {
  active: 'Aktif',
  suspended: 'Askıda',
  archived: 'Arşivlendi',
}

/** Bilinmeyen değerde ham veriyi basmak yerine değerin kendisini döner. */
export function planLabel(plan: string): string {
  return PLAN_LABEL[plan] ?? plan
}

export function workspaceStatusLabel(status: string): string {
  return WORKSPACE_STATUS_LABEL[status] ?? status
}

/**
 * Ücretsiz deneme süresi.
 *
 * 058'de 14 günden 7 güne indirildi. Bu sayı SQL tarafında da yazılı
 * (`create_teacher_workspace` içinde `INTERVAL '7 days'`); ikisi
 * birlikte değiştirilmeli.
 */
export const TRIAL_DAYS = 7

/** Denemede kaç öğrenci eklenebilir. Ürünü gerçekten denemeye yeter. */
export const TRIAL_STUDENT_LIMIT = 3

/**
 * Her planın kapsadığı özellikler — TEK KAYNAK.
 *
 * Hem vitrindeki fiyat bölümü hem uygulama içindeki plan ekranı bunu
 * okuyor. İki yerde elle yazılsaydı biri güncellenirken diğeri bayatlar
 * ve ürün kendi vaadi konusunda kendisiyle çelişirdi.
 *
 * ÖZELLİK KISITLAMASI YOK: liste plana göre değişmiyor, yalnız öğrenci
 * sayısı ve süre değişiyor. Bu yüzden tek bir dizi yeterli.
 */
export const PLAN_INCLUDED = [
  'Kitap havuzu ve kitap haritası',
  'İçindekiler listesini yapıştırarak toplu kitap aktarma',
  'Haftalık plan, ödev takibi ve öğretmen onayı',
  'Öğrenci ve veli panelleri (ücretsiz, sınırsız hesap)',
  'Müfredat akışı, koruma havuzu ve risk analizi',
  'Sayfa bazlı takip, hedefler ve yazdırılabilir rapor',
  "Ödev metnini WhatsApp'a kopyalama",
] as const

export interface WorkspaceUsage {
  plan: string
  studentLimit: number | null
  activeStudents: number
  trialEndsAt: string | null
  /** Aktif lisans varsa dolu (058). */
  licenseStartsAt: string | null
  licenseEndsAt: string | null
  licenseStatus: string | null
}

export interface QuotaState {
  /** Yeni öğrenci eklenebilir mi? */
  canAddStudent: boolean
  /** Sınırsız çalışma alanlarında null. */
  remaining: number | null
  /** 0-100. Sınırsızda null — dolmayan bir çubuk göstermek yanıltıcı. */
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
 * Kalan gün sayısı — deneme ya da lisans için.
 *
 * Gün SAYISI yukarı yuvarlanır: bugün bitecek bir süre "0 gün kaldı"
 * değil "son gün" olarak görünmeli. Süresi dolmuşsa 0.
 */
export function daysLeft(endsAt: string | null, now: Date = new Date()): number | null {
  if (!endsAt) return null

  const end = Date.parse(endsAt)
  if (Number.isNaN(end)) return null

  const ms = end - now.getTime()
  if (ms <= 0) return 0

  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

/** Geriye dönük ad — deneme için okunabilirliği koruyor. */
export const trialDaysLeft = daysLeft

/**
 * Çalışma alanının tek satırlık faturalama durumu.
 *
 * Ekranlar bu türetmeyi kendileri yapmamalı: "lisanslı mı, denemede mi,
 * süresi mi doldu" sorusu üç ayrı yerde farklı cevaplanırsa kullanıcı
 * bir ekranda uyarı görüp diğerinde görmez.
 */
export type LicenseState =
  | 'trialing'
  | 'trial_expired'
  | 'licensed'
  | 'license_expired'
  | 'unlimited'

export function licenseState(usage: WorkspaceUsage, now: Date = new Date()): LicenseState {
  if (usage.plan === 'trial') {
    const left = daysLeft(usage.trialEndsAt, now)
    return left !== null && left <= 0 ? 'trial_expired' : 'trialing'
  }

  if (usage.plan === 'licensed') {
    const left = daysLeft(usage.licenseEndsAt, now)
    return left !== null && left > 0 ? 'licensed' : 'license_expired'
  }

  // Devralınan kiracılar: ne denemede ne lisanslı.
  return 'unlimited'
}

export const LICENSE_STATE_LABEL: Record<LicenseState, string> = {
  trialing: 'Deneme sürüyor',
  trial_expired: 'Deneme süresi doldu',
  licensed: 'Plan aktif',
  license_expired: 'Plan süresi doldu',
  unlimited: 'Sınırsız',
}

/** Erişimin neden engellendiği. 058'deki blocked_reason ile aynı küme. */
export type BlockedReason =
  | 'suspended'
  | 'archived'
  | 'trial_expired'
  | 'license_expired'

export const BLOCKED_MESSAGE: Record<
  BlockedReason,
  { title: string; teacher: string; other: string }
> = {
  trial_expired: {
    title: 'Deneme süreniz doldu',
    teacher: `${TRIAL_DAYS} günlük deneme süreniz sona erdi. Verilerinizin hiçbiri silinmedi; bir plan aldığınızda kaldığınız yerden devam edersiniz.`,
    // Öğrenci ve veli ödemeyle ilgili değil; onlara fatura dili
    // kurulmaz, ne yapmaları gerektiği söylenir.
    other:
      'Öğretmeninizin çalışma alanı şu an erişime kapalı. Bilgileriniz duruyor; öğretmeninizle iletişime geçebilirsiniz.',
  },
  license_expired: {
    title: 'Plan süreniz doldu',
    teacher:
      'Planınızın süresi sona erdi. Verilerinizin hiçbiri silinmedi; planınızı yenilediğinizde kaldığınız yerden devam edersiniz.',
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
