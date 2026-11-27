// SORU / NET HESABI — saf.
//
// Net = doğru − yanlış / bölen. YKS (TYT/AYT): 4 yanlış 1 doğruyu
// götürür. LGS: 3 yanlış 1 doğruyu götürür. Diğer: ceza yok (bölen 0).

export type ExamTag = 'TYT' | 'AYT' | 'LGS' | 'GENEL'
export const EXAM_TAGS: ExamTag[] = ['TYT', 'AYT', 'LGS', 'GENEL']

export function penaltyDivisor(tag: ExamTag): number {
  if (tag === 'TYT' || tag === 'AYT') return 4
  if (tag === 'LGS') return 3
  return 0
}

export function net(correct: number, wrong: number, divisor: number): number {
  const raw = divisor > 0 ? correct - wrong / divisor : correct
  return Math.round(raw * 100) / 100
}

/** Doğruluk yüzdesi (0–100); hiç soru yoksa null. */
export function accuracy(correct: number, wrong: number, blank: number): number | null {
  const total = correct + wrong + blank
  return total > 0 ? Math.round((correct / total) * 100) : null
}

/** Öğrencinin sınav türünden kullanılabilir etiketler. */
export function examTagsFor(examType: string | null | undefined): ExamTag[] {
  const t = (examType ?? '').toLocaleUpperCase('tr')
  if (t.includes('YKS') || t.includes('TYT') || t.includes('AYT')) return ['TYT', 'AYT']
  if (t.includes('LGS')) return ['LGS']
  return ['GENEL']
}

/**
 * Bugünden geriye kesintisiz gün serisi. `days` 'YYYY-MM-DD' kümesi.
 * Bugün henüz kayıt yoksa seri dünden sayılır (gün bitmedi).
 */
export function streak(days: Set<string>, today: string): number {
  const d = new Date(`${today}T12:00:00Z`)
  if (!days.has(today)) d.setUTCDate(d.getUTCDate() - 1)
  let n = 0
  while (days.has(d.toISOString().slice(0, 10))) {
    n++
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return n
}

export function formatNet(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
