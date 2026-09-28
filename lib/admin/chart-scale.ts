// GRAFİK ÖLÇEĞİ — saf hesap (components/admin/charts). Test edilir.
//
// Eksen her zaman SIFIRDAN başlar (sayım ve para; kesik eksen farkı
// büyütüp yanıltır) ve "yuvarlak" bir üst değere çıkar: 0 / 50 / 100.

/** Yuvarlak üst sınır: 1, 2, 2.5, 5 × 10^n. Boş/sıfır veride 1. */
export function niceMax(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1
  const exp = Math.floor(Math.log10(max))
  const base = 10 ** exp
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (max <= step * base) return step * base
  }
  return 10 * base
}

/** Üç ızgara çizgisi: 0, yarı, üst. */
export function ticks(max: number): number[] {
  const top = niceMax(max)
  return [0, top / 2, top]
}

/** 1.284 / 12,9 B / 4,2 Mn — Türkçe kısaltma. */
export function compact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn`
  if (abs >= 10_000) return `${(n / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} B`
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })
}

/**
 * Önceki eşit döneme göre değişim (yüzde, tam sayı). Önceki dönem sıfırsa
 * yüzde anlamsız: null döner (arayüz "yeni" der, "+∞%" demez).
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

/** Dizinin son yarısı ile ilk yarısını karşılaştırır (aynı uzunlukta pencereler). */
export function splitHalves(values: number[]): { current: number; previous: number } {
  const half = Math.floor(values.length / 2)
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  return { previous: sum(values.slice(0, half)), current: sum(values.slice(values.length - half)) }
}
