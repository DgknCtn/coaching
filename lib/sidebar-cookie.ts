/**
 * Masaüstü sidebar daraltma tercihinin cookie adı.
 *
 * Ayrı dosyada: okuyucu tarafı (lib/sidebar-prefs.ts) `next/headers`
 * kullanıyor ve client bundle'a giremez. Sabit ise hem client hem server
 * tarafından gerekiyor.
 */
export const SIDEBAR_COOKIE = 'sidebar_collapsed'
