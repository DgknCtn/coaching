// GELECEK HAFTA ÖZETİ (M1.0-04, EKLE).
//
// Canlı test belgesinin örneği: "Gelecek hafta: Salı 18:00 Matematik
// 60 dk · Cuma 21:30 Takip 30 dk" — tek satırda, öğrencinin gelecek
// haftaki planlı temaslarının kısa özeti.
//
// SAYFA KODUNA GÖMÜLMEDİ: belge bunun "ileride öğretmenin genel
// haftalık/aylık takvimini besleyebileceğini" söylüyor. Bu pakette
// yalnız tek öğrenci sayfasında kullanılıyor ama fonksiyon sayfa
// bağımsız saf bir modül — ileride genel ekrana taşınması, kopyala-
// yapıştır değil, içe aktarma meselesi olsun diye.
//
// SAF: `new Date()` çağırmaz, zaman dilimi dönüşümü
// `lib/service-structure.ts`teki ZATEN TEST EDİLMİŞ
// `formatSessionWeekdayLong`/`formatSessionClock` fonksiyonlarına
// bırakılır — burada ikinci bir Istanbul saat dilimi hesaplaması
// icat edilmiyor.

import { formatSessionWeekdayLong, formatSessionClock } from '@/lib/service-structure'

export interface NextWeekSessionLike {
  currentPlannedAt: string
  serviceId: string
  status: string
  durationMinutes: number | null
}

export interface NextWeekServiceLabel {
  label: string
}

/**
 * `"Salı 18:00 Birebir Ders 60 dk · Cuma 21:30 Koçluk 30 dk"`
 *
 * Hiç oturum yoksa (ya da hepsi iptal edilmişse) `null` döner —
 * çağıran taraf "gelecek hafta planı yok" gibi bir boş durum metni
 * gösterebilir ya da satırı hiç basmayabilir.
 *
 * SIRALAMA: planlanan ana göre, erkenden geçe. İPTAL EDİLENLER
 * ATLANIR — öğretmenin "gelecek hafta ne var" sorusuna iptal olmuş
 * bir ders cevap vermemeli.
 */
export function buildNextWeekPreview(
  sessions: NextWeekSessionLike[],
  serviceInfo: Record<string, NextWeekServiceLabel>
): string | null {
  const relevant = sessions
    .filter((s) => s.status !== 'iptal')
    .slice()
    .sort((a, b) => a.currentPlannedAt.localeCompare(b.currentPlannedAt))

  if (relevant.length === 0) return null

  return relevant
    .map((s) => {
      const label = serviceInfo[s.serviceId]?.label ?? 'Ders'
      const weekday = formatSessionWeekdayLong(s.currentPlannedAt)
      const time = formatSessionClock(s.currentPlannedAt)
      const duration = s.durationMinutes ? ` ${s.durationMinutes} dk` : ''
      return `${weekday} ${time} ${label}${duration}`
    })
    .join(' · ')
}
