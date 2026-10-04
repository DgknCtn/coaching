// Ödev yük özeti (M1.0-01 §2–3).
//
// Sepette ve WhatsApp mesajında görünen Toplam / sayfa-test kırılımı /
// Günlük ort. bu TEK modülden gelir. İki yer ayrı hesap yaparsa öğretmenin
// ekranda gördüğü "~15" ile veliye giden "~14" ayrışır — dokümanın açık
// kuralı "ayrı hesap yapılmaz".
//
// Saf fonksiyonlar: `now` dışarıdan verilir, `new Date()` çağrılmaz.
// Gün farkı İSTANBUL takvim günüyle hesaplanır (lib/homework-status.ts);
// saat farkını 24'e bölmek akşam bakan öğretmene bir gün eksik gösterirdi.

import { APP_TIME_ZONE, localDateString } from '@/lib/homework-status'
import { zonedWallTimeToInstant } from '@/lib/service-structure'
import { unitLabel, type UnitMode } from '@/lib/unit-labels'

/** Kırılımda görünme sırası — doküman "60 sayfa · 25 test" diyor. */
const MODE_ORDER = ['page', 'test', 'section', 'step', 'trial'] as const

export interface LoadSummary {
  /** Seçili tüm birimlerin ortak çalışma adedi. */
  total: number
  /** Takip türüne göre adet; yalnız sıfırdan büyük olanlar, MODE_ORDER sırasıyla. */
  breakdown: { mode: string; count: number }[]
  /** Teslime kalan İstanbul takvim günü; teslim yoksa null. Bugün teslimse 0. */
  daysLeft: number | null
  /** total / max(daysLeft, 1), yukarı yuvarlanmış. Yaklaşık değer, kota değil. */
  dailyAverage: number | null
}

/** İki YYYY-MM-DD arasındaki tam gün sayısı. */
export function calendarDayDiff(fromDay: string, toDay: string): number {
  const from = Date.UTC(
    Number(fromDay.slice(0, 4)),
    Number(fromDay.slice(5, 7)) - 1,
    Number(fromDay.slice(8, 10))
  )
  const to = Date.UTC(
    Number(toDay.slice(0, 4)),
    Number(toDay.slice(5, 7)) - 1,
    Number(toDay.slice(8, 10))
  )
  return Math.round((to - from) / 86_400_000)
}

function normalizeMode(mode: UnitMode): string {
  return mode && (MODE_ORDER as readonly string[]).includes(mode) ? mode : 'test'
}

/**
 * Sepetteki birimlerden yük özeti.
 *
 * `dueDay` İstanbul günü (YYYY-MM-DD). Saat günlük ortalamayı değiştirmez:
 * Cumartesi 18:00 teslimde Cumartesi de çalışma günüdür.
 */
export function summarizeLoad(
  units: { trackingMode: UnitMode }[],
  dueDay: string | null | undefined,
  now: Date
): LoadSummary {
  const counts = new Map<string, number>()
  for (const u of units) {
    const mode = normalizeMode(u.trackingMode)
    counts.set(mode, (counts.get(mode) ?? 0) + 1)
  }
  const breakdown = MODE_ORDER.filter((m) => (counts.get(m) ?? 0) > 0).map((m) => ({
    mode: m,
    count: counts.get(m) ?? 0,
  }))
  const total = units.length

  if (!dueDay || !/^\d{4}-\d{2}-\d{2}$/.test(dueDay)) {
    return { total, breakdown, daysLeft: null, dailyAverage: null }
  }
  const daysLeft = calendarDayDiff(localDateString(now), dueDay)
  const divisor = Math.max(daysLeft, 1)
  const dailyAverage = total > 0 ? Math.ceil(total / divisor) : 0
  return { total, breakdown, daysLeft, dailyAverage }
}

/** "60 sayfa · 25 test" — kırılım tek türse de yazılır ("29 sayfa"). */
export function formatBreakdown(summary: LoadSummary): string {
  return summary.breakdown
    .map((b) => `${b.count.toLocaleString('tr-TR')} ${unitLabel(b.mode)}`)
    .join(' · ')
}

/**
 * Sepet kartı ile WhatsApp'ın paylaştığı satırlar:
 *   Toplam: 85 çalışma
 *   60 sayfa · 25 test
 *   Günlük ort.: ~15 çalışma
 */
export function formatLoadLines(summary: LoadSummary): string[] {
  if (summary.total === 0) return []
  const lines = [`Toplam: ${summary.total.toLocaleString('tr-TR')} çalışma`]
  const breakdown = formatBreakdown(summary)
  if (breakdown) lines.push(breakdown)
  if (summary.dailyAverage !== null && summary.daysLeft !== null && summary.daysLeft >= 0) {
    lines.push(`Günlük ort.: ~${summary.dailyAverage.toLocaleString('tr-TR')} çalışma`)
  }
  return lines
}

const dayFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  weekday: 'long',
})

const clockFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * "10 Ekim 2026 Cumartesi · 18:00" — saat yoksa yalnız gün.
 *
 * `dueAt` varsa gün ondan türetilir (ikisi çelişemez); yoksa `dueDay`.
 */
export function formatDueDateTime(
  dueDay: string | null | undefined,
  dueAt?: Date | string | null
): string {
  const at = dueAt ? (dueAt instanceof Date ? dueAt : new Date(dueAt)) : null
  const validAt = at && !Number.isNaN(at.getTime()) ? at : null
  const base = validAt ?? (dueDay ? new Date(`${dueDay}T12:00:00Z`) : null)
  if (!base || Number.isNaN(base.getTime())) return '—'

  const parts = dayFormatter.formatToParts(base)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const natural = `${get('day')} ${get('month')} ${get('year')} ${get('weekday')}`
  return validAt ? `${natural} · ${clockFormatter.format(validAt)}` : natural
}

/** Sepetteki "6 gün kaldı" etiketi. */
export function formatDaysLeft(daysLeft: number | null): string | null {
  if (daysLeft === null) return null
  if (daysLeft === 0) return 'Bugün'
  if (daysLeft === 1) return 'Yarın'
  if (daysLeft > 1) return `${daysLeft} gün kaldı`
  return `${Math.abs(daysLeft)} gün geçti`
}

/** Seçilen İstanbul günü + saatinden (HH:MM) gerçek an; geçersizse null. */
export function dueAtFromLocal(
  dueDay: string | null | undefined,
  time: string | null | undefined
): Date | null {
  if (!dueDay || !/^\d{4}-\d{2}-\d{2}$/.test(dueDay)) return null
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null
  const [y, m, d] = dueDay.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  if (h > 23 || min > 59) return null
  return zonedWallTimeToInstant(y, m, d, h, min)
}

/** Bir anın İstanbul saati "HH:MM". */
export function localClock(at: Date): string {
  return clockFormatter.format(at)
}
