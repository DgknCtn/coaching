// YÖNETİM İŞLEMİ ÖNİZLEMESİ — 128'deki hesabın istemci karşılığı.
//
// Kural (veritabanıyla aynı): süre bitmişse BUGÜNDEN, sürüyorsa bitişten
// eklenir — GREATEST(COALESCE(ends_at, NOW()), NOW()) + aralık.
// Önizleme yalnız bilgi içindir; gerçek değeri veritabanı hesaplar.

function base(endsAt: string | null, now: Date): Date {
  const end = endsAt ? new Date(endsAt) : null
  return end && end.getTime() > now.getTime() ? new Date(end) : new Date(now)
}

export function extendByDays(endsAt: string | null, days: number, now: Date = new Date()): Date {
  const d = base(endsAt, now)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

/** Postgres gibi: ay sonunu taşırmaz (31 Ocak + 1 ay = 28/29 Şubat). */
export function extendByMonths(endsAt: string | null, months: number, now: Date = new Date()): Date {
  const d = base(endsAt, now)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}
