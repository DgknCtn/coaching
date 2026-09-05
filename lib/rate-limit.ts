import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { reportError } from '@/lib/observability'

// Kimlik akışlarında hız sınırı (050, 068'de sertleştirildi).
//
// Sunucusuz ortamda bellekteki sayaç yalnız o örnekte yaşar; ortak durum
// veritabanında tutulur. Sayma ve sınır kararı tek atomik adımda
// `check_rate_limit` RPC'sinde yapılır — "sor, sonra artır" iki eşzamanlı
// denemenin ikisinin de geçmesine izin verirdi.
//
// ============================================================
// LİMİTLER ARTIK BURADA DEĞİL, VERİTABANINDA (068)
//
// 068'e kadar bu dosya kova anahtarını, üst sınırı ve pencereyi RPC'ye
// PARAMETRE olarak geçiyordu ve RPC anon'a açıktı. İki sonucu vardı:
//
//   a) Saldırgan `p_max_attempts = 1` göndererek sayacı tek çağrıda
//      doldurabiliyordu.
//   b) Anahtar tuzsuz SHA-256 olduğu için tahmin edilebiliyordu: hedefin
//      e-postasını bilen `login:subject:<sha256(email)>` kovasını
//      yeniden üretip HİÇ giriş denemeden o hesabı 15 dakika
//      kilitleyebiliyordu.
//
// Artık eylem ADI gönderiliyor; limitler ve özetleme sunucuda. Özetin
// tuzu veritabanında duruyor ve uygulamaya hiç gelmiyor, yani kova
// anahtarı dışarıdan üretilemiyor.
// ============================================================

/**
 * Eylem başına sınırlar — BELGELEME AMAÇLI.
 *
 * Gerçek değerler `check_rate_limit` fonksiyonunun içindeki CASE
 * bloğunda (068). Buradaki kopya yalnız okuyana ne olduğunu anlatıyor;
 * bir yerde değiştirilirse diğerinin de güncellenmesi gerekir ve
 * migration bunu yorumda söylüyor.
 */
export const RATE_LIMITS = {
  /** Kaba kuvvete karşı. 15 dakikada 10 giriş denemesi. */
  login: { max: 10, windowSeconds: 15 * 60 },
  /** Otomatik hesap üretimine karşı. Saatte 5 kayıt. */
  register: { max: 5, windowSeconds: 60 * 60 },
  /** E-posta bombardımanına karşı. Saatte 5 sıfırlama isteği. */
  passwordReset: { max: 5, windowSeconds: 60 * 60 },
  /** Davet token'ı tahmine kapalı ama kabul denemesi yine de sınırlı. */
  inviteAccept: { max: 10, windowSeconds: 15 * 60 },
} as const

export type RateLimitAction = keyof typeof RATE_LIMITS

/**
 * İstemcinin IP adresi.
 *
 * Vercel `x-forwarded-for` başlığını kendisi yazar ve istemcinin
 * gönderdiğini EZER, bu yüzden ilk değer güvenilirdir. Başlık hiç yoksa
 * sabit bir kovaya düşülür: o durumda sınır tüm anonim trafiği tek sayaçta
 * toplar — kaba ama açık bırakmaktan iyidir.
 *
 * ÖZETLENMEDEN GÖNDERİLİYOR: özet artık sunucuda, tuzla alınıyor. Ham IP
 * zaten isteğin kendisiyle veritabanı sunucusuna ulaşmıyor; yalnız bu
 * RPC'nin parametresi olarak gidiyor ve tabloya özeti yazılıyor.
 */
async function clientIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || 'bilinmeyen'
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
 * kötü bir arıza olurdu. Karar korunuyor ama artık SESSİZ DEĞİL:
 * koruma devreden çıktığında merkezî hata kaydına düşüyor — fark
 * edilmeden aylarca kapalı kalması, açık kalma kararının kendisinden
 * daha tehlikeli.
 */
export async function checkRateLimit(
  action: RateLimitAction,
  subject?: string
): Promise<RateLimitResult> {
  const supabase = await createClient()

  // İki kova: kaynak (IP) ve hedef (e-posta). Ön ek, iki kovanın aynı
  // özete düşmemesi için.
  const subjects = [`ip:${await clientIp()}`]
  if (subject?.trim()) subjects.push(`subject:${subject.trim().toLowerCase()}`)

  let worst: RateLimitResult = { allowed: true, retryAfterSeconds: 0 }

  for (const value of subjects) {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_action: action,
      p_subject: value,
    })

    if (error) {
      reportError(error, {
        scope: 'rate-limit',
        message: 'Hız sınırı sayacı çalışmadı; istek geçirildi.',
        action,
      })
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
