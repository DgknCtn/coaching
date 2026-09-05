// Tarih biçimlendirme — paylaşılan yardımcılar.
//
// Üç yönetim sayfası da satır içi `toLocaleDateString('tr-TR')`
// çağırıyordu; göreli zaman ("5 dk önce") için hiçbir şey yoktu.

/** `04.09.2026` — tabloda ve kartlarda kullanılan kısa biçim. */
export function formatDateTr(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('tr-TR')
}

/** `04.09.2026 14:32` — tek bir olayın ne zaman olduğu önemliyse. */
export function formatDateTimeTr(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * `5 dk önce`, `2 gün önce`, `az önce`.
 *
 * ============================================================
 * NEDEN GÖRECELİ
 *
 * Yönetim panelinde sorulan soru "bu müşteri ne zaman giriş yaptı"
 * değil, "bu müşteri ürünü HÂLÂ kullanıyor mu". Ham tarih bu soruyu
 * okuyucunun kafasında çıkarma işlemine dönüştürüyordu.
 *
 * BİR AYDAN ESKİSİ TARİHE DÖNER: "47 gün önce" kimsenin kafasında bir
 * şeye karşılık gelmiyor; o noktada takvim tarihi daha okunur.
 * ============================================================
 */
export function formatRelativeTr(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'

  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)

  // Gelecek tarih (saat kayması ya da bozuk veri): tarihe düş, "-3 dk
  // önce" gibi bir şey basma.
  if (seconds < 0) return formatDateTr(d)

  if (seconds < 60) return 'az önce'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} dk önce`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} saat önce`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'dün'
  if (days < 30) return `${days} gün önce`

  return formatDateTr(d)
}
