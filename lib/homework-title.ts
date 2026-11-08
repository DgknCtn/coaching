import { localDateString } from '@/lib/homework-status'
import { isoWeekKeyOfDate } from '@/lib/iso-week'
import { academicWeekNumber } from '@/lib/weekly-flow'
import type { FlowRef } from '@/lib/open-homework'

// HAFTALIK ÖDEV BAŞLIĞI — EK-08 (08.11.2026).
//
// Başlık, ödevin bağlanacağı haftanın "Öğrenciyle N. Hafta" numarasından
// önerilir: "6. Hafta Ödevi". Numara Görüşmeler'deki etiketle AYNI
// fonksiyondan gelir (academicWeekNumber, labelFlows) — ayın haftası,
// takvim haftası ya da ders sayısı değil.
//
// HEDEF HAFTA = ödevin bağlandığı haftalık akış (karar: haftanın başladığı
// hafta). Aktif haftaya ekleme aynı numarayı alır; numara artmaz. Yeni hafta
// açılacaksa numara önceki haftanın bir fazlası, bugünün haftasından da geri
// kalmaz (Pazar günü açılan "gelecek hafta" bugünün numarasını almasın).
//
// Numara bilinmiyorsa (hiç hafta açılmamış) null: uydurulmaz, öğretmen
// başlığı elle girer. Başlık üretmek hafta açmaz/kapatmaz.

export function targetWeekNumber(input: {
  /** labelFlows çıktısı — başlangıca göre sıralı. */
  flows: FlowRef[]
  activeFlowId: string | null
  /** Plan aktif haftanın dışına düşüyor ya da açık hafta yok. */
  needsTransition: boolean
  today?: Date
}): number | null {
  const { flows, activeFlowId, needsTransition } = input

  if (!needsTransition) {
    return flows.find(f => f.id === activeFlowId)?.weekNo ?? null
  }

  const first = flows[0]
  if (!first) return null

  const today = input.today ?? new Date()
  const todayNo = academicWeekNumber(first.startsAt, isoWeekKeyOfDate(localDateString(today)))
  const lastNo = flows[flows.length - 1]?.weekNo ?? null
  const candidates = [todayNo, lastNo !== null ? lastNo + 1 : null].filter((n): n is number => n !== null)
  return candidates.length > 0 ? Math.max(...candidates) : null
}

export function defaultHomeworkTitle(weekNo: number | null): string | null {
  return weekNo !== null && weekNo > 0 ? `${weekNo}. Hafta Ödevi` : null
}
