// Müfredat Akışı mantığı (R5.2).
//
// Kural: Konu bloklarının zaman ekseninde nasıl hareket ettiğini belirleyen
// TEK yer burasıdır. Ekran yalnız sonucu gösterir ve kaydeder; kendi tarih
// aritmetiğini kurmaz.
//
// Neden saf fonksiyon: taşıma ve süre değişimi zincirleme etki yaratıyor
// ("Fonksiyonlar 3 hafta ileri kayarsa aynı scope'un devamı da kayar").
// Bu mantık SQL'e gömülseydi test edilemez, componente gömülseydi
// tekrarlanırdı. Sunucu tarafı yalnız sonucu yazar
// (save_student_curriculum_flow).
//
// AKIŞ BİR TAKVİM DEĞİLDİR: "Fonksiyonlar 4 hafta" TEK bloktur, 4 ayrı
// haftalık kayıt değil (MA-04). Bu yüzden model (start, end) tutar.

import { todayDateString } from '@/lib/homework-status'

/** Bir konu bloğu. Tarihler YYYY-MM-DD (date-only). */
export interface FlowItem {
  /** Mevcut kayıt id'si; yeni eklenen blokta null. */
  id: string | null
  topicId: string | null
  name: string
  startDate: string
  endDate: string
  /** Geçildi işareti — YALNIZ eğitmen koyar (§4.4). */
  passed: boolean
  note: string | null
}

/**
 * Müfredat durumu (§4.4).
 *
 * İkisi tarihten TÜRETİLİR, biri saklanır:
 *   upcoming (Yaklaşıyor) — başlangıç tarihi henüz gelmedi
 *   current  (Zamanı Geldi) — başlangıç geldi, eğitmen Geçildi yapmadı
 *   passed   (Geçildi) — eğitmen işaretledi
 *
 * `endDate` hiçbir duruma girmez: planlanan bitiş tarihinin geçmesi konuyu
 * otomatik Geçildi YAPMAZ (MA-08). Bu, kuralın kod düzeyindeki garantisi.
 */
export type FlowStatus = 'upcoming' | 'current' | 'passed'

export const FLOW_STATUS_LABEL: Record<FlowStatus, string> = {
  upcoming: 'Yaklaşıyor',
  current: 'Zamanı Geldi',
  passed: 'Geçildi',
}

export function deriveFlowStatus(item: FlowItem, today?: string): FlowStatus {
  if (item.passed) return 'passed'
  const day = today ?? todayDateString()
  return item.startDate > day ? 'upcoming' : 'current'
}

// ============================================================
// Tarih aritmetiği
//
// UTC üzerinden yapılır ve yalnız gün ekler/çıkarır; saat dilimi kayması
// olmaz çünkü girdi ve çıktı date-only string'dir.
// ============================================================

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function addWeeks(date: string, weeks: number): string {
  return addDays(date, weeks * 7)
}

/** Blok kaç hafta sürüyor? 1 hafta = başlangıç günü + 6 gün. */
export function durationWeeks(item: Pick<FlowItem, 'startDate' | 'endDate'>): number {
  const start = new Date(`${item.startDate}T00:00:00Z`).getTime()
  const end = new Date(`${item.endDate}T00:00:00Z`).getTime()
  const days = Math.round((end - start) / 86_400_000) + 1
  return Math.max(1, Math.round(days / 7))
}

/** Verilen süreye göre bitiş günü. */
export function endDateFor(startDate: string, weeks: number): string {
  return addDays(startDate, Math.max(1, weeks) * 7 - 1)
}

// ============================================================
// Zincirleme işlemler
//
// HEPSİ YALNIZ TEK BİR SCOPE'UN LİSTESİ ÜZERİNDE ÇALIŞIR. Çağıran taraf
// zaten yalnız o scope'un bloklarını verir; TYT Matematik kaydırması AYT
// Fizik'i bu yüzden etkileyemez (MA-11).
//
// OVERLAP HATA DEĞİLDİR (MA-07): hiçbir fonksiyon çakışma kontrolü yapmaz
// ve yapmamalıdır. Aynı hafta iki konu çalışmak gerçek bir durumdur.
// ============================================================

function shiftSuffix(items: FlowItem[], fromIndex: number, days: number): FlowItem[] {
  if (days === 0) return items
  return items.map((item, i) =>
    i < fromIndex
      ? item
      : { ...item, startDate: addDays(item.startDate, days), endDate: addDays(item.endDate, days) }
  )
}

/**
 * Bir konuyu ileri/geri taşır; AYNI SCOPE'taki devam blokları da aynı
 * miktarda kayar (§4.3, MA-05).
 *
 * Negatif hafta geriye taşır. Taşınan bloğun kendi süresi değişmez.
 */
export function moveItem(items: FlowItem[], itemId: string, weeks: number): FlowItem[] {
  const index = items.findIndex(i => i.id === itemId)
  if (index === -1 || weeks === 0) return items
  return shiftSuffix(items, index, weeks * 7)
}

/**
 * Bir konunun süresini değiştirir; devam blokları FARK KADAR kayar
 * (§4.3, MA-06). 4 -> 5 hafta ise devamı 1 hafta ileri gider.
 */
export function resizeItem(items: FlowItem[], itemId: string, newWeeks: number): FlowItem[] {
  const index = items.findIndex(i => i.id === itemId)
  if (index === -1) return items

  const target = items[index]
  const current = durationWeeks(target)
  const next = Math.max(1, Math.round(newWeeks))
  if (next === current) return items

  const resized = items.map((item, i) =>
    i === index ? { ...item, endDate: endDateFor(item.startDate, next) } : item
  )
  return shiftSuffix(resized, index + 1, (next - current) * 7)
}

/**
 * Yeni konu ekler ve devamını kendi süresi kadar iter.
 *
 * İtme olmasaydı yeni blok kendisinden sonraki HER bloğun üstüne binerdi;
 * bu, overlap'in meşru olduğu durumlardan biri değil, düpedüz kaza olurdu.
 */
export function insertItem(
  items: FlowItem[],
  atIndex: number,
  name: string,
  weeks = 1
): FlowItem[] {
  const index = Math.max(0, Math.min(atIndex, items.length))
  const startDate =
    index === 0
      ? (items[0]?.startDate ?? todayDateString())
      : addDays(items[index - 1].endDate, 1)

  const created: FlowItem = {
    id: null,
    topicId: null,
    name,
    startDate,
    endDate: endDateFor(startDate, weeks),
    passed: false,
    note: null,
  }

  const shifted = shiftSuffix(items, index, Math.max(1, weeks) * 7)
  return [...shifted.slice(0, index), created, ...shifted.slice(index)]
}

/**
 * Konuyu akıştan çıkarır.
 *
 * Devam blokları BİLİNÇLİ OLARAK KAYDIRILMAZ: eğitmen bir konuyu
 * "atlıyoruz" diye çıkardığında, öğrenciye çoktan söylenmiş sonraki
 * tarihlerin kendiliğinden öne çekilmesi sürpriz olurdu. Boşluk kalır ve
 * eğitmen isterse taşıyarak kapatır.
 *
 * Bu YALNIZ kişisel akışı değiştirir; öğrencinin o konudaki geçmiş
 * çalışması bambaşka bir tabloda durur ve silinmez (MA-10).
 */
export function removeItem(items: FlowItem[], itemId: string): FlowItem[] {
  return items.filter(i => i.id !== itemId)
}

/** Konuyu Geçildi yapar veya işareti kaldırır. Tarihler değişmez (MA-09). */
export function setPassed(items: FlowItem[], itemId: string, passed: boolean): FlowItem[] {
  return items.map(i => (i.id === itemId ? { ...i, passed } : i))
}

// ============================================================
// Özet
// ============================================================

export interface FlowSummary {
  totalWeeks: number
  passedWeeks: number
  currentWeeks: number
  upcomingWeeks: number
  firstStart: string | null
  lastEnd: string | null
}

/** Akış özeti — ekranın sağ panelindeki toplamlar. */
export function summarizeFlow(items: FlowItem[], today?: string): FlowSummary {
  let passedWeeks = 0
  let currentWeeks = 0
  let upcomingWeeks = 0

  for (const item of items) {
    const weeks = durationWeeks(item)
    const status = deriveFlowStatus(item, today)
    if (status === 'passed') passedWeeks += weeks
    else if (status === 'current') currentWeeks += weeks
    else upcomingWeeks += weeks
  }

  const starts = items.map(i => i.startDate).sort()
  const ends = items.map(i => i.endDate).sort()

  return {
    totalWeeks: passedWeeks + currentWeeks + upcomingWeeks,
    passedWeeks,
    currentWeeks,
    upcomingWeeks,
    firstStart: starts[0] ?? null,
    lastEnd: ends[ends.length - 1] ?? null,
  }
}

/**
 * Şablondan akış üretir (istemci tarafı önizleme).
 *
 * Sunucudaki assign_curriculum_template ile AYNI zincirleme kuralı:
 * her blok bir öncekinin ertesi günü başlar. İki tarafın da aynı sonucu
 * vermesi şart — bu yüzden kural tek cümleyle burada da yazılıdır.
 */
export function buildFlowFromTemplate(
  templateItems: { name: string; durationWeeks: number; note?: string | null }[],
  startDate: string
): FlowItem[] {
  const out: FlowItem[] = []
  let cursor = startDate

  for (const item of templateItems) {
    const weeks = Math.max(1, item.durationWeeks)
    const endDate = endDateFor(cursor, weeks)
    out.push({
      id: null,
      topicId: null,
      name: item.name,
      startDate: cursor,
      endDate,
      passed: false,
      note: item.note ?? null,
    })
    cursor = addDays(endDate, 1)
  }

  return out
}
