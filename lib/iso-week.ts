// ISO HAFTA — Ders & Görüşmeler'in omurgası (M1.0-02 §4, §5 "Hafta omurgası").
//
// Sistem anahtarı `2026-W41`; kullanıcıya görünen `41. Hafta · 5–11 Ekim 2026`.
// Ödev Planlama ve Akademik Akış aynı anahtara bağlanabilir, verileri bu
// ekrana kopyalanmaz.
//
// SAF: `new Date()` çağırmaz; "şimdi" hep dışarıdan gelir. Gün sınırları
// APP_TIME_ZONE (Europe/Istanbul) takvimiyle çizilir — sunucu UTC'de
// çalıştığından Pazar 23:30'daki bir ders yanlış haftaya düşmesin.

import { APP_TIME_ZONE, localDateString } from '@/lib/homework-status'
import { zonedWallTimeToInstant } from '@/lib/service-structure'

export type IsoWeekKey = `${number}-W${string}`

const KEY_RE = /^(\d{4})-W(\d{2})$/

/** 'YYYY-MM-DD' -> UTC gece yarısı (yalnız takvim hesabı için). */
function utcDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** ISO haftası: Pazartesi başlar; yılın ilk Perşembesini içeren hafta 1. hafta. */
function isoWeekOfDate(dateStr: string): { year: number; week: number } {
  const d = utcDate(dateStr)
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  // Haftanın Perşembesi hangi yıldaysa hafta o yılındır.
  const thursday = new Date(d.getTime() + (4 - dow) * 86_400_000)
  const year = thursday.getUTCFullYear()
  const jan1 = Date.UTC(year, 0, 1)
  const week = Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1
  return { year, week }
}

/** Bir anın (Istanbul takviminde) ISO hafta anahtarı. */
export function isoWeekKey(instant: Date): IsoWeekKey {
  return isoWeekKeyOfDate(localDateString(instant))
}

/** 'YYYY-MM-DD' takvim gününün ISO hafta anahtarı. */
export function isoWeekKeyOfDate(dateStr: string): IsoWeekKey {
  const { year, week } = isoWeekOfDate(dateStr)
  return `${year}-W${String(week).padStart(2, '0')}` as IsoWeekKey
}

export function isValidWeekKey(value: string | null | undefined): value is IsoWeekKey {
  if (!value) return false
  const m = KEY_RE.exec(value)
  if (!m) return false
  const week = Number(m[2])
  if (week < 1 || week > 53) return false
  // 53. hafta yalnız 53 haftalık yıllarda var.
  return isoWeekKeyOfDate(weekMonday(value)) === value
}

/** Haftanın Pazartesisi ('YYYY-MM-DD'). */
export function weekMonday(key: string): string {
  const m = KEY_RE.exec(key)
  if (!m) throw new Error(`Geçersiz hafta anahtarı: ${key}`)
  const year = Number(m[1])
  const week = Number(m[2])
  // 4 Ocak her zaman 1. haftadadır.
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Dow = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay()
  const monday1 = jan4.getTime() - (jan4Dow - 1) * 86_400_000
  return toDateStr(new Date(monday1 + (week - 1) * 7 * 86_400_000))
}

/** Haftanın yedi günü, Pazartesi'den Pazar'a ('YYYY-MM-DD'). */
export function weekDays(key: string): string[] {
  const start = utcDate(weekMonday(key)).getTime()
  return Array.from({ length: 7 }, (_, i) => toDateStr(new Date(start + i * 86_400_000)))
}

/**
 * Haftanın gerçek an aralığı: [Pazartesi 00:00, sonraki Pazartesi 00:00)
 * Istanbul saatiyle. Sorgularda `gte from` + `lt to`.
 */
export function weekRange(key: string): { from: Date; to: Date } {
  const days = weekDays(key)
  const [y1, m1, d1] = days[0].split('-').map(Number)
  const next = toDateStr(new Date(utcDate(days[6]).getTime() + 86_400_000))
  const [y2, m2, d2] = next.split('-').map(Number)
  return {
    from: zonedWallTimeToInstant(y1, m1, d1, 0, 0),
    to: zonedWallTimeToInstant(y2, m2, d2, 0, 0),
  }
}

/** Haftayı `delta` kadar kaydırır (önceki/sonraki hafta). */
export function shiftWeek(key: string, delta: number): IsoWeekKey {
  const monday = utcDate(weekMonday(key)).getTime()
  return isoWeekKeyOfDate(toDateStr(new Date(monday + delta * 7 * 86_400_000)))
}

/** Haftanın dokunduğu takvim ayları ('YYYY-MM'); ay sınırındaki haftada iki. */
export function weekMonths(key: string): string[] {
  const days = weekDays(key)
  return Array.from(new Set([days[0].slice(0, 7), days[6].slice(0, 7)]))
}

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

/**
 * `41. Hafta · 5–11 Ekim 2026`
 * Ay sınırında: `40. Hafta · 28 Eylül – 4 Ekim 2026`
 * Yıl sınırında: `1. Hafta · 29 Aralık 2025 – 4 Ocak 2026`
 */
export function weekLabel(key: string): string {
  const m = KEY_RE.exec(key)
  if (!m) return key
  const week = Number(m[2])
  const days = weekDays(key)
  const [ys, ms, ds] = days[0].split('-').map(Number)
  const [ye, me, de] = days[6].split('-').map(Number)

  let range: string
  if (ys !== ye) {
    range = `${ds} ${MONTHS_TR[ms - 1]} ${ys} – ${de} ${MONTHS_TR[me - 1]} ${ye}`
  } else if (ms !== me) {
    range = `${ds} ${MONTHS_TR[ms - 1]} – ${de} ${MONTHS_TR[me - 1]} ${ye}`
  } else {
    range = `${ds}–${de} ${MONTHS_TR[me - 1]} ${ye}`
  }
  return `${week}. Hafta · ${range}`
}

/** Bir anın düştüğü Istanbul takvim günü — haftalık tabloda gruplama için. */
export function dayKeyOf(instant: Date | string): string {
  const d = instant instanceof Date ? instant : new Date(instant)
  return localDateString(d)
}

export { APP_TIME_ZONE }
