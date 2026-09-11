// Haftalık Akış — aktif çalışma döngüsü (R7 / Site Testi 05).
//
// ZİHİNSEL MODEL (belgenin tek cümlesi): "Ana temas haftalık ritmi kurar;
// Haftalık Akış o ritmi yönetir; Ödev Planlama aktif akışın içine çalışma
// yükü yerleştirir."
//
// BU MODÜLÜN VARLIK SEBEBİ: belgenin kritik kuralı — *"Ana temas, Haftalık
// Akış'ın varsayılan kapanışını üretir. Aktif Haftalık Akış'ın tek resmi
// kapanış zamanı kesinleşmiş Son Teslim alanıdır."* Buradaki tehlike
// ikinci bir deadline'ın sessizce doğmasıdır: ana temas bir yerde, son
// teslim başka bir yerde hesaplanırsa iki tarih ayrışır ve hangisinin
// resmi olduğunu kimse bilemez. Bu yüzden "resmi kapanış hangisidir"
// sorusunu yanıtlayan TEK yer burasıdır ve `resolveFlowDue` dışında
// hiçbir dosya bu kararı vermez.
//
// Aynı gerekçe tempo için de geçerli: yüzde eşikleri (§6) arayüzde
// yazılsaydı üç ekranda üç farklı sınır olurdu.

import type { ServiceLike } from '@/lib/service-structure'
import { defaultSubmissionDeadline } from '@/lib/service-structure'
import { localDateString } from '@/lib/homework-status'

// ============================================================
// RESMİ KAPANIŞ
// ============================================================

export type FlowDueSource = 'anchor' | 'custom'

export interface FlowDue {
  /** Akışın tek resmi kapanış zamanı. */
  dueAt: Date
  source: FlowDueSource
  /** Ana temastan üretilen varsayılan — özel tarih seçiliyken de korunur. */
  anchorAt: Date | null
}

/**
 * Akışın resmi kapanışı.
 *
 * ÖZEL TARİH HER ZAMAN KAZANIR. Belgenin ifadesi net: *"Öğretmen özel son
 * teslim seçerse o haftanın resmi kapanışı özel tarihtir."* Ana temas
 * sonradan değişse bile buraya dokunmaz — §4: *"Özel son teslim zaten
 * seçilmişse otomatik değiştirme yapılmaz."*
 *
 * `anchorAt` yine de döndürülür ve ATILMAZ: öğretmene "ana temas Pazar
 * 10:00 ama bu haftanın kapanışı Cuma 20:00" diyebilmek, sessizce
 * ayrışmış iki tarihten çok daha iyidir.
 */
export function resolveFlowDue(input: {
  customDueAt: Date | null
  anchorService: ServiceLike | null
  from: Date
}): FlowDue | null {
  const anchorAt = input.anchorService
    ? defaultSubmissionDeadline(input.anchorService, input.from)
    : null

  if (input.customDueAt) {
    return { dueAt: input.customDueAt, source: 'custom', anchorAt }
  }
  if (anchorAt) {
    return { dueAt: anchorAt, source: 'anchor', anchorAt }
  }
  // Ne ana temas ne özel tarih: akışın resmi kapanışı yoktur. Uydurulmuş
  // bir tarih (ör. "7 gün sonra") öğretmenin koymadığı bir söz olurdu.
  return null
}

/**
 * Ana temas TEK SEFERLİK değiştiğinde aktif akışın son teslimi taşınsın mı?
 *
 * Karar verilmez, yalnız SORULUR (§4, kabul #11). Özel tarih seçiliyse
 * soru bile sorulmaz: öğretmen o haftanın kapanışını zaten elle kurmuş.
 */
export function shouldAskToMoveDue(flow: {
  dueSource: FlowDueSource
  status: FlowStatus
}): boolean {
  return flow.status === 'active' && flow.dueSource === 'anchor'
}

// ============================================================
// AKIŞ DURUMU
// ============================================================

export type FlowStatus = 'active' | 'closed'

/**
 * Bir ödev partisi hangi akışa aittir?
 *
 * Belgenin üç senaryosu (§5) tek bir soruya indirgenir: partinin son
 * teslimi aktif akışın kapanışını AŞIYOR MU?
 *
 *  A) Aşmıyor  → aktif akışa girer, haftanın toplam yükünü artırır.
 *  B) Aşıyor   → gelecek bir döngüye aittir; "Yaklaşan Ödevler"de bekler
 *                ve bu haftanın toplamına KARIŞMAZ (kabul #7).
 *  C) Özel son teslim akışın içinde kalıyorsa yine aktif akıştadır;
 *     istisna olan tarihtir, aidiyet değil.
 *
 * Kapanmış akışa yeni ödev bağlanmaz (§5 son madde).
 */
export function flowMembership(input: {
  batchDueAt: Date
  flow: { dueAt: Date; status: FlowStatus } | null
}): 'active_flow' | 'upcoming' | 'no_flow' {
  if (!input.flow || input.flow.status !== 'active') return 'no_flow'
  return input.batchDueAt.getTime() <= input.flow.dueAt.getTime()
    ? 'active_flow'
    : 'upcoming'
}

// ============================================================
// TEMPO VE RİSK
// ============================================================

export type PaceBand = 'good' | 'slightly_behind' | 'clearly_behind' | 'critical'

/** §6 tablosu. Eşikler TEK yerde; arayüz kendi sınırını koymaz. */
export const PACE_BAND_LABEL: Record<PaceBand, string> = {
  good: 'İyi gidiyor',
  slightly_behind: 'Biraz geride',
  clearly_behind: 'Belirgin geride',
  critical: 'Kritik',
}

export function paceBand(ratio: number): PaceBand {
  if (ratio >= 0.85) return 'good'
  if (ratio >= 0.7) return 'slightly_behind'
  if (ratio >= 0.45) return 'clearly_behind'
  return 'critical'
}

export interface FlowPace {
  /** Yayınlanan yük / kullanılabilir gerçek süre (çalışma/gün). */
  startingPerDay: number
  /** Kalan yük / kalan süre (çalışma/gün). */
  requiredPerDay: number
  /** startingPerDay / requiredPerDay — 1'e yakın olması "planında" demek. */
  ratio: number
  band: PaceBand
  remainingMs: number
}

const DAY_MS = 86_400_000

/**
 * Akışın tempo tablosu.
 *
 * TEMPO BAŞLANGICI AKIŞIN AÇILIŞI DEĞİL, YAYIN ANIDIR (§4). Belge bunu
 * örnekle açıklıyor: ödev Pazartesi 13:00'te görünür olduysa öğrenci
 * Pazar sabahından beri gecikmiş sayılmaz. Akışın açılışını kullanmak,
 * öğretmenin geç yayınladığı bir haftada öğrenciyi borçlu doğurturdu.
 *
 * Yük hiç yayınlanmadıysa tempo YOKTUR (null): sıfır yükü sıfır güne
 * bölüp "kritik" demek, henüz iş verilmemiş öğrenciyi suçlamak olurdu.
 */
export function calculateFlowPace(input: {
  totalUnits: number
  deliveredUnits: number
  /** İlk yayının yapıldığı an. Yayın yoksa null. */
  firstPublishedAt: Date | null
  dueAt: Date
  now: Date
}): FlowPace | null {
  const { totalUnits, deliveredUnits, firstPublishedAt, dueAt, now } = input
  if (totalUnits <= 0 || !firstPublishedAt) return null

  const availableMs = dueAt.getTime() - firstPublishedAt.getTime()
  if (availableMs <= 0) return null

  const remainingMs = Math.max(0, dueAt.getTime() - now.getTime())
  const remainingUnits = Math.max(0, totalUnits - deliveredUnits)

  const startingPerDay = totalUnits / (availableMs / DAY_MS)

  // Süre bittiyse kalan yükün tamamı "bugün" demektir; sonsuza bölmemek
  // için kalan süre en az bir güne yuvarlanır. Aksi hâlde son teslim
  // anında ratio ya 0'a ya sonsuza giderdi.
  const remainingDays = Math.max(remainingMs / DAY_MS, 1 / 24)
  const requiredPerDay = remainingUnits / remainingDays

  // Kalan yük yoksa gereken tempo sıfırdır: öğrenci bitirmiş, oran 1.
  const ratio = requiredPerDay === 0 ? 1 : startingPerDay / requiredPerDay

  return {
    startingPerDay,
    requiredPerDay,
    ratio,
    band: paceBand(ratio),
    remainingMs,
  }
}

// ============================================================
// SON HAREKET
// ============================================================

export const DELIVERY_SILENCE_DAYS = 3

/**
 * "3 gündür yeni teslim yok" sinyali.
 *
 * Belgenin uyarısı aynen korunuyor: *"Bu, 'çalışmıyor' anlamına gelmez;
 * yalnızca sisteme yeni teslim gelmediğini söyler."* Bu yüzden dönen şey
 * bir yargı değil bir olgu — metni de öyle.
 */
export function deliverySilence(input: {
  lastDeliveryAt: Date | null
  now: Date
}): { silent: boolean; days: number; phrase: string } {
  if (!input.lastDeliveryAt) {
    return { silent: false, days: 0, phrase: 'Henüz teslim yok' }
  }
  const days = Math.floor(
    (input.now.getTime() - input.lastDeliveryAt.getTime()) / DAY_MS
  )
  if (days >= DELIVERY_SILENCE_DAYS) {
    return { silent: true, days, phrase: `${days} gündür yeni teslim yok` }
  }
  return { silent: false, days, phrase: 'Son teslim: ' + relativeDays(days) }
}

function relativeDays(days: number): string {
  if (days <= 0) return 'bugün'
  if (days === 1) return 'dün'
  return `${days} gün önce`
}

// ============================================================
// ZAMANINDA TESLİM FOTOĞRAFI
// ============================================================

export interface OnTimeSnapshot {
  /** Son teslim anında teslim edilmiş çalışma sayısı. */
  onTime: number
  /** O andaki toplam yük. */
  total: number
}

/**
 * Kapanış anının fotoğrafı (§6, kabul #9).
 *
 * NEDEN FOTOĞRAF: geç teslimler sonradan eklenebilir ve nihai tamamlanma
 * 135/135'e çıkabilir; ama "110'u zamanında geldi" bilgisi o an
 * kaydedilmezse geri getirilemez. Tamamlanma oranından türetilemez,
 * çünkü tamamlanma sonradan değişir.
 *
 * Zamanında sayılma ölçütü ÖĞRENCİNİN GÖNDERİMİDİR, öğretmenin onayı
 * değil (kabul #8): *"Öğretmen onayı öğrencinin ilerlemesini geriye
 * düşürmez."* Onaya bağlansaydı öğretmenin geç bakması öğrenciyi geç
 * teslim etmiş gösterirdi.
 */
export function captureOnTime(input: {
  items: { firstSubmittedAt: Date | null }[]
  dueAt: Date
}): OnTimeSnapshot {
  const onTime = input.items.filter(
    i => i.firstSubmittedAt !== null && i.firstSubmittedAt.getTime() <= input.dueAt.getTime()
  ).length
  return { onTime, total: input.items.length }
}

// ============================================================
// DAĞITIM DURUMU
// ============================================================

/**
 * "135/143 dağıtıldı — 8 yeni çalışma dağıtılmayı bekliyor" (§5 Senaryo A).
 *
 * Sistem kalanları KENDİ DAĞITMAZ (§6): öğrenci yükü günlere kendisi
 * paylaştırır. Sonradan eklenen çalışma bu yüzden "planlanmadı" olarak
 * ayrı durur — otomatik yerleştirme, öğrencinin kurduğu haftayı habersiz
 * bozmak olurdu (kabul #6).
 */
export function distributionState(input: {
  totalUnits: number
  plannedUnits: number
}): { planned: number; total: number; unplanned: number; phrase: string } {
  const unplanned = Math.max(0, input.totalUnits - input.plannedUnits)
  const phrase =
    unplanned === 0
      ? `${input.plannedUnits}/${input.totalUnits} dağıtıldı`
      : `${input.plannedUnits}/${input.totalUnits} dağıtıldı — ${unplanned} yeni çalışma dağıtılmayı bekliyor`
  return { planned: input.plannedUnits, total: input.totalUnits, unplanned, phrase }
}

// ============================================================
// GÜNLÜK DAĞILIM
// ============================================================

export interface DailyDeliveryBucket {
  /** YEREL takvim günü (YYYY-MM-DD, Europe/Istanbul). */
  date: string
  /** ISO hafta günü 1..7 (Pazartesi..Pazar) — başlık için. */
  weekday: number
  /** O gün teslim edilen çalışma sayısı. */
  delivered: number
}

export interface DailyDelivery {
  days: DailyDeliveryBucket[]
  /**
   * Haftanın penceresi DIŞINDA kalan teslim sayısı.
   *
   * Kapanışı geçmiş ama hâlâ açık bir akışta geç teslimler buraya
   * düşer. Son güne eklenmeleri grafiği yalan söyletirdi: o gün
   * yapılmamış bir işi o güne yazmak olurdu.
   */
  outsideWindow: number
}

/**
 * Haftanın gün gün teslim dağılımı (§7 no.6).
 *
 * YALNIZ "TAMAMLANAN" EKSENİ. Belgedeki hedef ekranda iki eksen var —
 * "Planlanan (dağıtılan)" ve "Tamamlanan" — ama planlanan eksenin verisi
 * YOK: öğrencinin yükü günlere kendi dağıtması R7-05'in açıkça "sonraki
 * adım" diye işaretlediği iş ve 077 bu yüzden `planned_for_date`
 * sütununu bilinçle açmadı. Olmayan sütundan çubuk çizmek, kimsenin
 * yazmadığı bir veriyi grafiğe dönüştürmek olurdu; öğrenci dağıtım
 * ekranı geldiğinde ikinci eksen buraya eklenir.
 *
 * Gün aralığı akışın başlangıcından kapanışına kadar; uzun süre açık
 * kalmış bir akışta çok sayıda sütun çıkabilir, arayüz yatay kaydırır.
 */
export function dailyDelivery(input: {
  deliveries: (Date | null)[]
  startsAt: Date
  dueAt: Date
}): DailyDelivery {
  const firstDay = localDateString(input.startsAt)
  const lastDay = localDateString(input.dueAt)

  const counts = new Map<string, number>()
  let outsideWindow = 0
  for (const d of input.deliveries) {
    if (!d) continue
    const key = localDateString(d)
    // String karşılaştırması YYYY-MM-DD'de doğrudan tarih
    // karşılaştırmasıdır (en-CA biçiminin seçilme sebebi).
    if (key < firstDay || key > lastDay) {
      outsideWindow += 1
      continue
    }
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const days: DailyDeliveryBucket[] = []
  // Gün ilerletme UTC üzerinden yapılıyor: 'YYYY-MM-DD' ayrıştırılıp tam
  // gün eklemek saf takvim aritmetiğidir, yaz saati kaymasından etkilenmez.
  for (
    let cursor = new Date(`${firstDay}T00:00:00Z`);
    cursor.toISOString().slice(0, 10) <= lastDay;
    cursor = new Date(cursor.getTime() + DAY_MS)
  ) {
    const date = cursor.toISOString().slice(0, 10)
    days.push({
      date,
      // getUTCDay: 0=Pazar. ISO'da Pazar 7.
      weekday: cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay(),
      delivered: counts.get(date) ?? 0,
    })
  }

  return { days, outsideWindow }
}

// ============================================================
// DURUM BİLDİRİMİ RİTMİ
// ============================================================

/**
 * Ara temas zamanı geldi mi? (kabul #10)
 *
 * ESKİ MANTIK NEDEN YETMİYOR: sistem "3 günde bir" sabitiyle çalışıyordu.
 * Bu, iki günlük bir akışta anlamsız, on günlük bir akışta ise geç
 * kalıyordu. Belge sabiti tek mantık olmaktan çıkarıyor: *"aktif
 * döngünün ritmi ve gerçek teslim hareketi kullanılır."*
 *
 * İki tetikleyici var ve İKİSİ DE yeterli:
 *  - akışın ortası geçtiyse (ritim),
 *  - teslim sessizliği eşiği aşıldıysa (hareket).
 */
export function checkInDue(input: {
  flowStart: Date
  dueAt: Date
  lastCheckInAt: Date | null
  lastDeliveryAt: Date | null
  now: Date
}): { due: boolean; reason: 'midpoint' | 'silence' | null } {
  const { flowStart, dueAt, lastCheckInAt, now } = input

  const midpoint = new Date((flowStart.getTime() + dueAt.getTime()) / 2)
  const afterMidpoint = now >= midpoint
  const checkedSinceMidpoint = lastCheckInAt !== null && lastCheckInAt >= midpoint

  if (afterMidpoint && !checkedSinceMidpoint) return { due: true, reason: 'midpoint' }

  const silence = deliverySilence({ lastDeliveryAt: input.lastDeliveryAt, now })
  if (silence.silent) {
    // Sessizlik başladıktan sonra zaten bir kez soruldu ise tekrar sorma.
    const silenceStart = new Date(now.getTime() - silence.days * DAY_MS)
    if (!lastCheckInAt || lastCheckInAt < silenceStart) {
      return { due: true, reason: 'silence' }
    }
  }

  return { due: false, reason: null }
}
