import 'server-only'

import { cookies } from 'next/headers'
import {
  REFERRAL_COOKIE,
  REFERRAL_MAX_AGE_SECONDS,
  normalizeReferralCode,
} from './referral-code'

// PARTNER ATIF ÇEREZİ — sunucu tarafı okuma/silme.
//
// ============================================================
// NEDEN ÇEREZ, SORGU PARAMETRESİ DEĞİL
//
// Ziyaretçi `/?ref=KOD` ile geliyor ama kaydolması dakikalar sürebilir
// ve arada birkaç sayfa gezer. Daha kötüsü: Google ile kaydolursa
// tarayıcı Google'a gidip geri döner ve o yolculukta sorgu parametresi
// KAYBOLUR. Atıfı çerezde tutmak, OAuth yönlendirmesinden sağ çıkmanın
// tek yolu.
//
// httpOnly: kodun JavaScript'ten okunmasına gerek yok. Okunabilir
// olsaydı, üçüncü taraf bir betik hangi partnerin getirdiğini
// öğrenebilirdi.
//
// Biçim kuralı `lib/referral-code.ts`'te — middleware ve testler de
// aynı kuralı kullanabilsin diye (bu dosya `server-only`).
// ============================================================

export { REFERRAL_COOKIE, normalizeReferralCode } from './referral-code'

/** Kayıt sırasında okunur. Geçersizse null döner. */
export async function readReferralCode(): Promise<string | null> {
  const store = await cookies()
  return normalizeReferralCode(store.get(REFERRAL_COOKIE)?.value)
}

/**
 * Çalışma alanı kurulduktan sonra silinir.
 *
 * Silinmezse, aynı tarayıcıdan açılan İKİNCİ bir hesap da aynı partnere
 * yazılırdı — partner bir kez tanıtım yapıp aynı kişinin bütün
 * hesaplarından komisyon alırdı.
 */
export async function clearReferralCode(): Promise<void> {
  const store = await cookies()
  store.delete(REFERRAL_COOKIE)
}

/** Çerez ayarları — rota işleyicileri için. */
export const REFERRAL_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: REFERRAL_MAX_AGE_SECONDS,
  secure: process.env.NODE_ENV === 'production',
}
