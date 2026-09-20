// Kaynak plan durumu sözlüğü (R7 Kaynak Mimarisi §6.2 + Ek sayfa).
//
// Kural: "Planın ilerisinde / Planla uyumlu / Hafif geride / Belirgin
// geride / Hedef tarihi riskli" etiketlerinin ve bunları üreten eşiklerin
// TEK yeri burasıdır. Ekranlar kendi kıyas metnini yazmaz —
// lib/resource-plan.ts, lib/homework-status.ts ve lib/unit-labels.ts ile
// aynı kalıp.
//
// NEDEN YÜZDE DEĞİL ORAN: durum etiketi ham ilerleme yüzdesinden değil,
// "hedefe yetişmek için BUGÜN gereken tempo" ile "plan kurulurken
// belirlenen tempo" arasındaki orandan üretilir. Böylece 520 testlik bir
// kaynakla 120 testlik bir fasikül aynı ölçekte karşılaştırılabilir:
// ikisinde de R = 1,5 "planın yarı yarıya üstüne çıkmış tempo" demektir.
//
// MATEMATİK BURADA DEĞİL: P ve G değerleri lib/plan-pace.ts'in
// calculatePlanTempo'sundan gelir. Bu modül yalnız KIYASLAR ve ETİKETLER.
//
// KULLANICIYA "TEMPO YÜKSELİYOR" DENMEZ (belge nihai kararı): sistem
// doğrudan plan açısından sonucu söyler. "Tempo hafif artmalı" gibi
// ifadeler bilinçli olarak sözlükten çıkarılmıştır.

export type PlanDeviationKey =
  | 'ahead'
  | 'on_track'
  | 'slightly_behind'
  | 'clearly_behind'
  | 'target_at_risk'
  | 'target_completed'
  | 'not_evaluated'

/**
 * Eşikler UI METNİNE GÖMÜLMEZ (belge §6.2 notu): yüzde sınırları burada
 * parametre olarak durur, böylece ileride kalibre edilmeleri tek satırlık
 * bir değişikliktir ve hiçbir ekran metni yalan söylemez.
 *
 * R = G / P olmak üzere:
 *   R < 0,85          Planın ilerisinde
 *   0,85 <= R <= 1,15 Planla uyumlu      (normal tolerans bandı)
 *   1,15 <  R <  1,30 Hafif geride
 *   1,30 <= R <  1,60 Belirgin geride
 *   R >= 1,60         Hedef tarihi riskli
 */
export const PLAN_DEVIATION_THRESHOLDS = {
  ahead: 0.85,
  onTrack: 1.15,
  slightlyBehind: 1.3,
  clearlyBehind: 1.6,
} as const

const DEVIATION_LABEL: Record<PlanDeviationKey, string> = {
  ahead: 'Planın ilerisinde',
  on_track: 'Planla uyumlu',
  slightly_behind: 'Hafif geride',
  clearly_behind: 'Belirgin geride',
  target_at_risk: 'Hedef tarihi riskli',
  target_completed: 'Hedef Tamamlandı',
  not_evaluated: '—',
}

/**
 * Rozet tonu. `components/ui/badge.tsx` variant adlarıyla birebir;
 * ekranlar ham renk yazmaz.
 *
 * "Hafif geride" UYARI'dır, ALARM DEĞİL (§6.2 UI kuralı): telafi makul
 * olduğu için "Belirgin geride" ile aynı tonu paylaşır, ayrımı ikon ve
 * metin taşır. Yalnız "Hedef tarihi riskli" güçlü uyarı tonundadır.
 */
const DEVIATION_TONE: Record<
  PlanDeviationKey,
  'success' | 'warning' | 'destructive' | 'neutral'
> = {
  ahead: 'success',
  on_track: 'success',
  slightly_behind: 'warning',
  clearly_behind: 'warning',
  target_at_risk: 'destructive',
  target_completed: 'neutral',
  not_evaluated: 'neutral',
}

export function planDeviationLabel(key: PlanDeviationKey): string {
  return DEVIATION_LABEL[key]
}

export function planDeviationTone(key: PlanDeviationKey) {
  return DEVIATION_TONE[key]
}

export interface PlanDeviationInput {
  /** Atama durumu (lib/resource-plan.ts sözlüğü): pending/paused ise
   *  plan durumu ÜRETİLMEZ — henüz çalışılmayan kaynak geride olamaz. */
  status: string | null | undefined
  /** P — plan başlangıcındaki gerekli tempo.
   *  calculatePlanTempo().initialPacePerWeek */
  plannedPacePerWeek: number | null
  /** G — bugün hedefe yetişmek için gereken tempo.
   *  calculatePlanTempo().requiredPacePerWeek */
  requiredPacePerWeek: number | null
  /** Hedef kapsamda kalan birim. 0 ise kaynak hedefini tamamlamıştır. */
  remainingUnits: number
  /** Hedef tarih bugüne geldi veya geçti mi?
   *  calculatePlanTempo().isTargetReached */
  isTargetReached: boolean
  /** Plan başlangıcı (ISO). Bugünden ileriyse durum üretilmez. */
  startDate: string | null
  today?: Date
}

export interface PlanDeviation {
  key: PlanDeviationKey
  label: string
  tone: ReturnType<typeof planDeviationTone>
  /** R = G / P. Hesaplanamıyorsa null. */
  ratio: number | null
  /** (R - 1) x 100, tam sayıya yuvarlanmış. Hesaplanamıyorsa null. */
  deviationPercentage: number | null
}

function result(key: PlanDeviationKey, ratio: number | null): PlanDeviation {
  return {
    key,
    label: DEVIATION_LABEL[key],
    tone: DEVIATION_TONE[key],
    ratio,
    deviationPercentage: ratio === null ? null : Math.round((ratio - 1) * 100),
  }
}

/**
 * Bir kaynağın plan durumunu üretir.
 *
 * ÖZEL DURUMLAR ORANDAN ÖNCE GELİR (Ek §4) ve sırası önemlidir:
 *
 *   1. Kalan hedef kapsam = 0  -> Hedef Tamamlandı. Oran hesaplanmaz;
 *      bitmiş bir kaynağın "geride" görünmesi anlamsızdır.
 *   2. Bekliyor / başlangıç gelmemiş -> durum üretilmez. Bu iki hâl
 *      "henüz plan işlemiyor" demektir; tempo hesabına da girmezler
 *      (§5.1 ile aynı kural).
 *   3. Hedef tarihi geçmiş + kalan iş var -> doğrudan Hedef tarihi
 *      riskli. Burada oran zaten sonsuza gider; eşiğe sormaya gerek yok.
 *   4. P veya G yoksa (tarih girilmemiş) -> durum üretilmez. Tarihsiz
 *      kaynakta "geride" demek, öğretmenin hiç vermediği bir sözü
 *      tutmadığını iddia etmek olurdu.
 */
export function resolvePlanDeviation(input: PlanDeviationInput): PlanDeviation {
  const { status, plannedPacePerWeek: p, requiredPacePerWeek: g } = input

  if (input.remainingUnits <= 0) return result('target_completed', null)

  if (status === 'pending' || status === 'paused') {
    return result('not_evaluated', null)
  }

  if (input.startDate) {
    const today = input.today ?? new Date()
    if (today < new Date(input.startDate)) return result('not_evaluated', null)
  }

  if (input.isTargetReached) return result('target_at_risk', null)

  // P = 0 olamaz (kalan iş var ve hedef tarih gelecekte), ama savunmacı
  // davranmak bölme hatasından ucuz.
  if (p === null || g === null || p <= 0) return result('not_evaluated', null)

  const ratio = g / p
  const t = PLAN_DEVIATION_THRESHOLDS

  if (ratio < t.ahead) return result('ahead', ratio)
  if (ratio <= t.onTrack) return result('on_track', ratio)
  if (ratio < t.slightlyBehind) return result('slightly_behind', ratio)
  if (ratio < t.clearlyBehind) return result('clearly_behind', ratio)
  return result('target_at_risk', ratio)
}
