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
