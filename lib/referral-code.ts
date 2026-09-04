// PARTNER ATIF KODU — saf kural.
//
// ============================================================
// NEDEN AYRI DOSYA
//
// Bu kural ÜÇ yerde birden gerekiyor:
//   - middleware (Edge çalışma zamanı) — `?ref=` yakalarken
//   - sunucu aksiyonu — çerezi okurken
//   - test
//
// `lib/referral.ts` `next/headers` kullandığı için `server-only` ve
// Edge'de de testte de import edilemez. `lib/active-workspace.ts` ile
// aynı ayrım: saf mantık ayrı dosyada durur, çerez okuma ayrı yerde.
//
// Kural üç yerde elle tekrarlansaydı biri düzeltilirken diğerleri
// unutulurdu ve geçersiz bir kod bir yoldan içeri girerdi.
// ============================================================

export const REFERRAL_COOKIE = 'ref'

/** 30 gün: partnerin tanıtımını görüp bir ay sonra kaydolan hâlâ ona yazılmalı. */
export const REFERRAL_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/** Veritabanındaki CHECK ile aynı: `code ~ '^[A-Z0-9]{4,20}$'` (059). */
const CODE_PATTERN = /^[A-Z0-9]{4,20}$/

/**
 * Kodu normalleştirir; geçersizse null.
 *
 * Büyük harfe çevirir ve boşluk kırpar — bağlantı kopyalanırken boşluk
 * yapışması ve küçük harfle yazılması çok yaygın.
 */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const code = raw.trim().toUpperCase()
  return CODE_PATTERN.test(code) ? code : null
}
