// AKTİVASYON HUNİSİ (B17 · 120) — saf hesap.
//
// Her çalışma alanının kilometre taşları veritabanından geliyor; burada
// huni sayıları ve AYNI ALANIN açılışından o adıma kadar geçen sürenin
// ortancası hesaplanıyor. Ortalama değil ortanca: iki ay sonra dönen tek
// bir öğretmen ortalamayı anlamsızlaştırırdı.

export interface ActivationRow {
  workspace_id: string
  workspace_name: string
  created_at: string
  first_student_at: string | null
  first_assignment_at: string | null
  first_homework_at: string | null
  first_approval_at: string | null
  first_join_at: string | null
}

export const ACTIVATION_STEPS = [
  { key: 'first_student_at', label: 'İlk öğrenci' },
  { key: 'first_assignment_at', label: 'İlk kitap ataması' },
  { key: 'first_homework_at', label: 'İlk ödev' },
  { key: 'first_approval_at', label: 'İlk onay' },
  { key: 'first_join_at', label: 'Öğrenci/veli katıldı' },
] as const

export type ActivationStepKey = (typeof ACTIVATION_STEPS)[number]['key']

export interface FunnelStep {
  key: ActivationStepKey | 'created'
  label: string
  reached: number
  /** Açılan alanlara oranı (0-100, tam sayı). */
  percent: number
  /** Açılıştan bu adıma ortanca süre (saat); ulaşan yoksa null. */
  medianHours: number | null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function activationFunnel(rows: ActivationRow[]): FunnelStep[] {
  const total = rows.length
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  const steps: FunnelStep[] = [
    { key: 'created', label: 'Alan açıldı', reached: total, percent: total > 0 ? 100 : 0, medianHours: 0 },
  ]
  for (const step of ACTIVATION_STEPS) {
    const hours = rows
      .filter((r) => r[step.key] !== null)
      .map(
        (r) =>
          (new Date(r[step.key] as string).getTime() - new Date(r.created_at).getTime()) / 3_600_000
      )
      // Alan açılmadan önceki kayıt (ör. taşınmış veri) süreyi negatif
      // yapar; sıfıra kırpılır.
      .map((h) => Math.max(0, h))
    steps.push({
      key: step.key,
      label: step.label,
      reached: hours.length,
      percent: pct(hours.length),
      medianHours: median(hours),
    })
  }
  return steps
}

/** "3 sa" / "2,5 gün" — ortanca sürenin okunur hâli. */
export function formatHours(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 1) return '< 1 sa'
  if (hours < 48) return `${Math.round(hours)} sa`
  return `${(hours / 24).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} gün`
}

/** Alanın ulaştığı son adım — tabloda "nerede takıldı" sütunu. */
export function lastReachedStep(row: ActivationRow): string {
  let last = 'Alan açıldı'
  for (const step of ACTIVATION_STEPS) {
    if (row[step.key] === null) break
    last = step.label
  }
  return last
}
