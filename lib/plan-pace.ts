// Plan-hızı (pace) hesaplaması: bir kitap atamasının hedef tarihine göre
// öğrencinin plan çizgisinin önünde mi, gerisinde mi, yoksa tam uyumlu mu
// olduğunu hesaplar ve TEK, merkezi bir yerden Türkçe ifade üretir.
//
// Kural: Bu modül, "önde/uyumlu/geride" karşılaştırmasını yapan TEK yerdir.
// Başka hiçbir dosya kendi kıyaslama metnini üretmemeli — hepsi buradaki
// `phrase` alanını olduğu gibi kullanmalı. Asla "kötüsün/yetersizsin/çok
// geridesin" gibi yargılayıcı ifadeler üretilmez; sadece aşağıdaki nötr/
// pozitif şablonlar kullanılır.

export type PhraseKey = 'ahead' | 'on_track' | 'behind' | 'no_target' | 'not_started'

export interface PlanPaceInput {
  startDate: string | null // ISO date (YYYY-MM-DD), student_book_assignments.start_date
  targetEndDate: string | null // ISO date, student_book_assignments.target_end_date
  totalUnits: number // total_tests (test veya sayfa-aralığı birimi, tracking_mode bağımsız)
  completedUnits: number // completed_tests (sadece onaylanmış/tamamlanmış birimler)
  today?: Date // test edilebilirlik için enjekte edilebilir
}

export interface PlanPaceResult {
  delta: number // pozitif: önde, negatif: geride, 0: tam uyumlu
  expectedCompletedUnits: number
  phraseKey: PhraseKey
  phrase: string
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function calculatePlanPace(input: PlanPaceInput): PlanPaceResult {
  const { startDate, targetEndDate, totalUnits, completedUnits } = input
  const today = input.today ?? new Date()

  if (!targetEndDate) {
    return {
      delta: 0,
      expectedCompletedUnits: 0,
      phraseKey: 'no_target',
      phrase: 'Bu kitap için henüz bir hedef tarih belirlenmemiş.',
    }
  }

  const target = new Date(targetEndDate)
  const start = startDate ? new Date(startDate) : target

  if (today < start) {
    return {
      delta: 0,
      expectedCompletedUnits: 0,
      phraseKey: 'not_started',
      phrase: 'Bu kitap için plan henüz başlamadı.',
    }
  }

  const totalDurationMs = target.getTime() - start.getTime()
  const elapsedMs = today.getTime() - start.getTime()
  const elapsedFraction = totalDurationMs > 0 ? clamp(elapsedMs / totalDurationMs, 0, 1) : 1

  const expectedCompletedUnits = Math.round(elapsedFraction * totalUnits)
  const delta = completedUnits - expectedCompletedUnits

  const unitLabel = 'test'

  if (delta > 0) {
    return {
      delta,
      expectedCompletedUnits,
      phraseKey: 'ahead',
      phrase: `Plan çizgisinin ${delta} ${unitLabel} önündesin.`,
    }
  }

  if (delta < 0) {
    return {
      delta,
      expectedCompletedUnits,
      phraseKey: 'behind',
      phrase: `Plan çizgisinin ${Math.abs(delta)} ${unitLabel} gerisindesin.`,
    }
  }

  return {
    delta: 0,
    expectedCompletedUnits,
    phraseKey: 'on_track',
    phrase: 'Planla tam uyumlusun.',
  }
}

// ============================================================
// Haftalık tempo göstergeleri (R3 v2 §4)
//
// Amaç yalnız "yüzde kaç bitti" değil; öğrencinin hedef tarihe göre nerede
// olduğunu ve bugün hangi tempoya ihtiyaç duyduğunu sade biçimde göstermek.
// Yukarıdaki calculatePlanPace ile aynı girdilerden beslenir; ikisi de aynı
// start/target tarihlerini ve onaylı tamamlanma sayısını kullanır.
// ============================================================

export interface PlanTempoInput {
  startDate: string | null
  targetEndDate: string | null
  /** Takip edilen toplam test (T). */
  totalUnits: number
  /** Eğitmen onaylı tamamlanan test (C). */
  completedUnits: number
  today?: Date
}

export interface PlanTempoResult {
  totalUnits: number // T
  completedUnits: number // C
  remainingUnits: number // R = T - C
  totalWeeks: number | null // W
  remainingWeeks: number | null // Wr
  /** T / W — başlangıçta gerekli ortalama tempo. */
  initialPacePerWeek: number | null
  /** R / Wr — bugünkü durumda hedefe yetişmek için gereken ortalama. */
  requiredPacePerWeek: number | null
  completionPercentage: number
  /** Hedef tarih geçmiş veya bu hafta doluyorsa true; bu durumda
   *  requiredPacePerWeek "kalan işin tamamı" anlamına gelir. */
  isTargetReached: boolean
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

function weeksBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_WEEK
}

export function calculatePlanTempo(input: PlanTempoInput): PlanTempoResult {
  const { startDate, targetEndDate } = input
  const today = input.today ?? new Date()

  const totalUnits = Math.max(0, input.totalUnits)
  const completedUnits = Math.max(0, Math.min(input.completedUnits, totalUnits))
  const remainingUnits = totalUnits - completedUnits
  const completionPercentage =
    totalUnits === 0 ? 0 : Math.round((completedUnits / totalUnits) * 100)

  const base: PlanTempoResult = {
    totalUnits,
    completedUnits,
    remainingUnits,
    totalWeeks: null,
    remainingWeeks: null,
    initialPacePerWeek: null,
    requiredPacePerWeek: null,
    completionPercentage,
    isTargetReached: false,
  }

  if (!targetEndDate) return base

  const target = new Date(targetEndDate)
  const start = startDate ? new Date(startDate) : null

  // W yalnız başlangıç tarihi varsa anlamlı. Yuvarlama, "yaklaşık hafta"
  // ifadesine uygun olarak yukarı yapılır: 35,2 hafta 35 değil 36 haftadır.
  const totalWeeks = start ? Math.max(1, Math.ceil(weeksBetween(start, target))) : null

  // Hedef geçmişse veya bugüne denk geliyorsa kalan hafta yoktur; kalan işin
  // tamamı bu haftaya kalmıştır. Sıfıra bölmek yerine Wr = 0 raporlanır ve
  // gerekli tempo kalan test sayısına eşitlenir.
  const rawRemainingWeeks = weeksBetween(today, target)
  const isTargetReached = rawRemainingWeeks <= 0
  const remainingWeeks = isTargetReached ? 0 : Math.max(1, Math.ceil(rawRemainingWeeks))

  return {
    ...base,
    totalWeeks,
    remainingWeeks,
    initialPacePerWeek:
      totalWeeks && totalWeeks > 0 ? roundTempo(totalUnits / totalWeeks) : null,
    requiredPacePerWeek: isTargetReached
      ? remainingUnits
      : roundTempo(remainingUnits / remainingWeeks),
    isTargetReached,
  }
}

/** Tempo göstergeleri bir ondalık basamakla gösterilir (ör. 4,7 test/hafta). */
function roundTempo(value: number): number {
  return Math.round(value * 10) / 10
}
