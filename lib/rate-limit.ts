import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// Kimlik akışlarında hız sınırı (050).
//
// Sunucusuz ortamda bellekteki sayaç yalnız o örnekte yaşar; ortak durum
// veritabanında tutulur. Sayma ve sınır kararı tek atomik adımda
// `check_rate_limit` RPC'sinde yapılır — "sor, sonra artır" iki eşzamanlı
// denemenin ikisinin de geçmesine izin verirdi.
//
// GİZLİLİK: IP ve e-posta veritabanına HAM GİTMEZ. Burada SHA-256'dan
// geçirilir; sayaç tablosunda kimlik değil kimliğin özeti durur.

/** Eylem başına sınırlar. Kimlik akışları düşük hacimlidir; dar tutuldu. */
export const RATE_LIMITS = {
  /** Kaba kuvvete karşı. Aynı IP'den 15 dakikada 10 giriş denemesi. */
  login: { max: 10, windowSeconds: 15 * 60 },
  /** Otomatik hesap üretimine karşı. Saatte 5 kayıt. */
  register: { max: 5, windowSeconds: 60 * 60 },
  /** E-posta bombardımanına karşı. Saatte 5 sıfırlama isteği. */
  passwordReset: { max: 5, windowSeconds: 60 * 60 },
  /** Davet token'ı tahmine kapalı ama kabul denemesi yine de sınırlı. */
  inviteAccept: { max: 10, windowSeconds: 15 * 60 },
} as const

export type RateLimitAction = keyof typeof RATE_LIMITS

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * İstemcinin IP adresi.
 *
 * Vercel `x-forwarded-for` başlığını kendisi yazar ve istemcinin
 * gönderdiğini EZER, bu yüzden ilk değer güvenilirdir. Başlık hiç yoksa
 * sabit bir kovaya düşülür: o durumda sınır tüm anonim trafiği tek sayaçta
 * toplar — kaba ama açık bırakmaktan iyidir.
 */
async function clientKey(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || 'bilinmeyen'
  return sha256(ip)
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

/**
 * Sınırı kontrol eder ve sayacı artırır.
 *
 * `subject` verilirse (genelde e-posta) IP'ye ek olarak ONA da ayrı bir
 * sayaç işletilir: tek IP'den çok hesap denemesi de, çok IP'den tek hesaba
 * yüklenmek de yakalanır.
 *
 * AÇIK KALMA KARARI: RPC hata verirse istek ENGELLENMEZ. Sayaç altyapısı
 * bozuk diye kimsenin giriş yapamaması, hız sınırının olmamasından daha
 * kötü bir arıza olurdu. Hata sessizce yutulmaz, loglanır.
 */
export async function checkRateLimit(
  action: RateLimitAction,
  subject?: string
): Promise<RateLimitResult> {
  const { max, windowSeconds } = RATE_LIMITS[action]
  const supabase = await createClient()

  const keys = [`${action}:ip:${await clientKey()}`]
  if (subject?.trim()) {
    keys.push(`${action}:subject:${await sha256(subject.trim().toLowerCase())}`)
  }

  let worst: RateLimitResult = { allowed: true, retryAfterSeconds: 0 }

  for (const key of keys) {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_bucket_key: key,
      p_max_attempts: max,
      p_window_seconds: windowSeconds,
    })

    if (error) {
      console.error(
        '[rate-limit] sayaç çalışmadı, istek geçirildi:',
        JSON.stringify({ action, message: error.message })
      )
      continue
    }

    const result = data as { allowed: boolean; retry_after_seconds: number } | null
    if (result && !result.allowed) {
      worst = {
        allowed: false,
        retryAfterSeconds: Math.max(worst.retryAfterSeconds, result.retry_after_seconds ?? 0),
      }
    }
  }

  return worst
}

/** Kullanıcıya gösterilecek metin. Kalan süreyi yuvarlayarak söyler. */
export function rateLimitMessage(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60)
  if (minutes <= 1) return 'Çok fazla deneme yapıldı. Lütfen bir dakika sonra tekrar deneyin.'
  return `Çok fazla deneme yapıldı. Lütfen ${minutes} dakika sonra tekrar deneyin.`
}
