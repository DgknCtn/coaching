/**
 * Giriş kaydı satırlarının GÖRÜNÜM yardımcıları.
 *
 * NEDEN AYRI DOSYA: iki ekran aynı satırı gösteriyor — yönetim
 * panelindeki Güvenlik sekmesi ve öğretmenin Hesap Hareketleri ekranı.
 * Bunlar başlangıçta admin sayfasının içinde yaşıyordu; ikinci ekran
 * yazılırken kopyalansaydı, tarayıcı tanıma listesi ya da rozet rengi
 * birinde güncellenip diğerinde eskirdi.
 *
 * SAF FONKSİYONLAR: veri okumuyor, bileşen döndürmüyor. Bu yüzden hem
 * sunucu hem istemci bileşeninden çağrılabiliyor ve testi kolay.
 */

/**
 * Olay türünün rozet varyantı.
 *
 * RENK TEK BAŞINA ANLAM TAŞIMAZ — etiket her zaman yanında yazıyor
 * (§8). Renk yalnız tarama hızını artırıyor: yüz satırlık bir listede
 * kırmızıların gözle bulunabilmesi için.
 */
export function eventTone(
  type: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (type === 'login.failed' || type === 'login.rate_limited') return 'destructive'
  if (type === 'login.success' || type === 'register') return 'default'
  if (type === 'password_changed' || type === 'session_revoked') return 'secondary'
  return 'outline'
}

const MAX_RAW_UA = 40

/**
 * Tarayıcı kimliğini okunabilir hâle getirir.
 *
 * Ham user-agent 200 karakteri geçiyor ve tabloda tek satıra sığmıyor.
 * Sorulan soru "hangi tarayıcı, hangi işletim sistemi" — sürüm
 * numaraları değil.
 *
 * TANINMAYAN DEĞER KIRPILIR AMA GİZLENMEZ: bilinmeyen bir istemci
 * (betik, bot, alışılmadık tarayıcı) tam da görülmek istenen şeydir.
 * '—' göstermek onu normal bir tarayıcıdan ayırt edilemez kılardı.
 */
export function shortUserAgent(ua: string | null): string {
  if (!ua) return '—'

  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/i.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : null

  // SIRA ÖNEMLİ: Edge ve Opera kendilerini Chrome olarak da tanıtır,
  // Chrome da Safari olarak. En özelden en genele bakılmazsa her şey
  // "Chrome" ya da "Safari" görünür.
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/i.test(ua)
      ? 'Opera'
      : /Chrome\//i.test(ua)
        ? 'Chrome'
        : /Firefox\//i.test(ua)
          ? 'Firefox'
          : /Safari\//i.test(ua)
            ? 'Safari'
            : null

  if (!os && !browser) return ua.slice(0, MAX_RAW_UA)
  return [browser, os].filter(Boolean).join(' · ')
}

/** "İstanbul, TR" — ikisi de yoksa tire. */
export function locationLabel(row: {
  country: string | null
  city: string | null
}): string {
  return [row.city, row.country].filter(Boolean).join(', ') || '—'
}
