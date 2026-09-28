import type { NextRequest } from 'next/server'

// ZAMANLANMIŞ UÇLARIN ORTAK YETKİSİ.
//
// app/api/cron/purge-auth-events'in kuralı, artık birden çok uç
// kullandığı için burada tek yerde:
//   - CRON_SECRET tanımlı DEĞİLSE uç ÇALIŞMAZ ("sır yoksa herkese açık"
//     davranışı, üretimde değişkeni unutmanın cezasını sessizce ödemekti).
//   - Vercel Cron `Authorization: Bearer <CRON_SECRET>` gönderir.
//   - Karşılaştırma SABİT SÜRELİ: uzunluk ve karakter farkı zamanlamadan
//     sızmasın.

/** Sabit süreli karşılaştırma — erken dönüş yok. */
export function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

export type CronAuth = 'ok' | 'not_configured' | 'unauthorized'

export function checkCronAuth(request: NextRequest): CronAuth {
  const secret = process.env.CRON_SECRET
  if (!secret) return 'not_configured'
  const header = request.headers.get('authorization') ?? ''
  return timingSafeEqual(header, `Bearer ${secret}`) ? 'ok' : 'unauthorized'
}
