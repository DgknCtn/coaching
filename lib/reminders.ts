// HATIRLATMA KARARI — saf hesap (SaaS planı A2). Testli: tests/reminders.test.ts
//
// Günde bir çalışan cron (app/api/cron/hatirlatmalar) her aktif çalışma
// alanı için bu fonksiyonu çağırır; hangi iletinin gideceğine burada
// karar verilir, gönderim lib/email.ts'te.
//
// GÜN, İSTANBUL TAKVİM GÜNÜDÜR: "denemen 1 gün sonra bitiyor" cümlesi
// saat farkıyla değil takvimle okunur. Bitişi yarın 00:30 olan deneme
// için bugün "1 gün" denir, "0" değil.
//
// PENCERE, EŞİT DEĞİL "EN FAZLA": cron bir gün çalışmazsa (kesinti)
// ertesi gün yine doğru ileti gider. Aynı iletinin tekrarını tekillik
// anahtarı önler (email_log, 131); anahtarda bitiş günü var, yani süre
// uzatılırsa hatırlatma yeni tarih için yeniden gider.
//
// ÖNCELİK: aynı gün birden çok eşik tutuyorsa YALNIZ en yakın olan gider
// (2 gün kalmışken "3 gün" ve "1 gün" ikisi birden değil — "3 gün";
// ertesi gün "1 gün").

export type ReminderKind = 'trial_3' | 'trial_1' | 'trial_ended' | 'license_7' | 'license_1' | 'license_ended'

export interface ReminderWorkspace {
  workspaceId: string
  plan: string
  status: string
  isLibrary: boolean
  trialEndsAt: string | null
  licenseEndsAt: string | null
}

export interface Reminder {
  kind: ReminderKind
  /** İstanbul takvimiyle kalan gün (bitmişse 0). */
  daysLeft: number
  /** Bitiş anı (ISO) — iletide tarih olarak yazılır. */
  endsAt: string
  dedupeKey: string
}

const DAY = 86_400_000

/** "2026-09-28" — Europe/Istanbul takvim günü. */
export function istanbulDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d)
}

/** İki İstanbul günü arasındaki takvim farkı (b − a). */
export function calendarDaysBetween(a: Date, b: Date): number {
  const da = Date.parse(`${istanbulDay(a)}T00:00:00Z`)
  const db = Date.parse(`${istanbulDay(b)}T00:00:00Z`)
  return Math.round((db - da) / DAY)
}

function pick(
  prefix: 'trial' | 'license',
  endsAt: string,
  now: Date,
  thresholds: number[],
  workspaceId: string
): Reminder | null {
  const end = new Date(endsAt)
  if (Number.isNaN(end.getTime())) return null
  const left = calendarDaysBetween(now, end)
  const endDay = istanbulDay(end)

  if (end.getTime() <= now.getTime()) {
    // Bittiğinin ilk 3 günü içinde bir kez "bitti" iletisi; daha eskisi
    // için sessiz (aylar önce biten denemeye ileti gitmesin).
    if (left < -3) return null
    const kind = `${prefix}_ended` as ReminderKind
    return { kind, daysLeft: 0, endsAt, dedupeKey: `${kind}:${workspaceId}:${endDay}` }
  }

  // Eşikler artan sırada (1, 3 / 1, 7): kalan güne EŞİT ya da BÜYÜK en küçük eşik.
  const threshold = [...thresholds].sort((x, y) => x - y).find((t) => left <= t)
  if (threshold === undefined) return null
  const kind = `${prefix}_${threshold}` as ReminderKind
  return { kind, daysLeft: Math.max(left, 0), endsAt, dedupeKey: `${kind}:${workspaceId}:${endDay}` }
}

export function reminderFor(w: ReminderWorkspace, now: Date = new Date()): Reminder | null {
  // Askıda/arşivde ve kütüphane alanında hatırlatma yok.
  if (w.isLibrary || w.status !== 'active') return null

  if (w.plan === 'trial' && w.trialEndsAt) {
    return pick('trial', w.trialEndsAt, now, [1, 3], w.workspaceId)
  }
  if (w.plan === 'licensed' && w.licenseEndsAt) {
    return pick('license', w.licenseEndsAt, now, [1, 7], w.workspaceId)
  }
  return null
}
