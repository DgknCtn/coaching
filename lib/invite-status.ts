// Davetin GÖRÜNEN durumu.
//
// Neden ayrı bir türetme: `invitations.status` tek başına yetmez. Süresi
// dolmuş bir davet veritabanında hâlâ 'pending' durur; 'expired' değerini
// yazan tek yer accept_invitation'dır (024) ve o da ancak biri linki
// açmayı DENEDİĞİNDE çalışır. Öğretmen listesine olduğu gibi basılsa,
// üç gün önce ölmüş bir davet "aktif" görünürdü.
//
// Saf ve testli tutulmasının nedeni bu: kural tek yerde yazılı ve
// sınırları (tam expires_at anı) doğrulanabilir.

export type InviteDisplayStatus = 'active' | 'expired' | 'accepted' | 'revoked'

export const INVITE_STATUS_LABEL: Record<InviteDisplayStatus, string> = {
  active: 'Bekliyor',
  expired: 'Süresi doldu',
  accepted: 'Kabul edildi',
  revoked: 'İptal edildi',
}

/**
 * Davet süreleri role göre AYRIŞIR.
 *
 * Öğrenci daveti öğrencinin kayıtlı e-postasına kilitlidir; linki başkası
 * ele geçirse bile kabul edemez, bu yüzden bir hafta güvenli.
 *
 * Veli daveti çoğu zaman hiçbir e-postaya bağlı değildir (öğretmen veli
 * e-postasını bilmiyor). O davette linki eline geçiren herkes veli
 * olabileceği için TEK KORUMA penceredir — 48 saat.
 */
export const INVITE_TTL_MS: Record<'student' | 'parent', number> = {
  student: 7 * 24 * 60 * 60 * 1000,
  parent: 48 * 60 * 60 * 1000,
}

export interface InviteRow {
  status: string
  expiresAt: string
}

export function deriveInviteStatus(row: InviteRow, now: Date = new Date()): InviteDisplayStatus {
  if (row.status === 'accepted') return 'accepted'
  if (row.status === 'revoked') return 'revoked'

  const expires = Date.parse(row.expiresAt)
  // Okunamayan tarih "ölü" sayılır: aktif göstermek yanlış tarafa hata
  // yapmak olurdu.
  if (Number.isNaN(expires)) return 'expired'

  // Tam expires_at anı ARTIK GEÇERSİZ: veritabanı kontrolü de
  // `expires_at > NOW()` diyor (024), iki taraf aynı sınırı kullanmalı.
  return expires > now.getTime() ? 'active' : 'expired'
}

/**
 * "2 gün kaldı" / "5 saat kaldı" / "12 dakika kaldı".
 *
 * Gün altına inildiğinde saat, saat altına inildiğinde dakika gösterilir:
 * 48 saatlik veli davetinde "0 gün kaldı" demek işe yaramaz.
 */
export function inviteTimeLeftLabel(expiresAt: string, now: Date = new Date()): string {
  const expires = Date.parse(expiresAt)
  if (Number.isNaN(expires)) return '—'

  const ms = expires - now.getTime()
  if (ms <= 0) return 'Süresi doldu'

  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return `${Math.max(1, minutes)} dakika kaldı`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} saat kaldı`

  return `${Math.floor(hours / 24)} gün kaldı`
}

/** Yalnız aktif davetin linki paylaşılabilir; diğerleri ölüdür. */
export function isInviteShareable(row: InviteRow, now: Date = new Date()): boolean {
  return deriveInviteStatus(row, now) === 'active'
}
