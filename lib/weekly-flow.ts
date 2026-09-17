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
import { APP_TIME_ZONE, localDateString } from '@/lib/homework-status'

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
 *
 * KARŞILAŞTIRMA GÜN DÜZEYİNDE — ve bu, `attach_batch_to_flow`
 * (077:367) ile birebir aynı olmak ZORUNDA:
 *
 *     v_batch.due_date > (v_flow.due_at AT TIME ZONE 'Europe/Istanbul')::DATE
 *
 * Ödevin son teslimi bir GÜN (`homework_batches.due_date` DATE),
 * akışın kapanışı ise SAATLİ bir andır. Saat düzeyinde karşılaştırılsa
 * kapanış günü Pazar 10:00 iken aynı güne verilen ödev — günün saatsiz
 * hâli 00:00 sayıldığı için bazen "bu hafta", bazen "gelecek hafta"
 * çıkardı. Sunucu gün, istemci saat karşılaştırsaydı ekranda "bu
 * haftaya eklenecek" yazan ödev sunucuda bağlanmadan kalırdı.
 */
export function flowMembership(input: {
  batchDueAt: Date
  flow: { dueAt: Date; status: FlowStatus } | null
}): 'active_flow' | 'upcoming' | 'no_flow' {
  if (!input.flow || input.flow.status !== 'active') return 'no_flow'
  // Yerel gün (Europe/Istanbul) — UTC alınsaydı gece yarısına yakın
  // kapanışlar bir gün kayardı; SQL de yerel günü kullanıyor.
  return localDateString(input.batchDueAt) <= localDateString(input.flow.dueAt)
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
  /**
   * Hiç teslim yokken yazılacak cümle.
   *
   * KAPSAM ÇAĞIRANA GÖRE DEĞİŞİYOR ve bu yüzden metin sabit olamaz:
   * Haftalık Akış ekranı YALNIZ o haftanın tesliminlerine bakıyor,
   * Genel Bakış'ın "Bu Hafta" bloğu ise öğrencinin TÜM gönderimlerine
   * (belge: *"sisteme yeni teslim gelmediğini söyler"*). İkisi de
   * "Henüz teslim yok" deseydi, aynı öğrenci için biri "yok" öteki
   * "2 gün önce" derken ekranlar çelişiyor görünürdü.
   */
  emptyPhrase?: string
}): { silent: boolean; days: number; phrase: string } {
  if (!input.lastDeliveryAt) {
    return { silent: false, days: 0, phrase: input.emptyPhrase ?? 'Henüz teslim yok' }
  }
  const days = Math.floor(
    (input.now.getTime() - input.lastDeliveryAt.getTime()) / DAY_MS
  )
  if (days >= DELIVERY_SILENCE_DAYS) {
    return { silent: true, days, phrase: `${days} gündür yeni teslim yok` }
  }
  // "SON TESLİM" DEĞİL "SON HAREKET" (R7-06.06).
  //
  // Buradaki cümle bir TARİH değil, öğrencinin son GÖNDERİMİ. Ama aynı
  // kartta `weekly_flows.due_at` da "Son Teslim" adıyla duruyor ve
  // Türkçede "teslim" ikisini birden adlandırıyor. Testte görülen sonuç
  // tam olarak bu: kart bir yanda doğru biçimde "3 gün kaldı", öbür
  // yanda "Son teslim: bugün" yazıyordu — okuyan kişi ikincisini
  // "deadline bugün" diye okudu ve haklıydı.
  //
  // Hesap doğruydu, AD yanlıştı. Resmi kapanışın metni artık ayrı bir
  // fonksiyonda (`dueLabel`) ve ileri yönlü; bu cümle geçmişe bakan
  // hareket bilgisi olarak kendi adını taşıyor.
  return { silent: false, days, phrase: 'Son hareket: ' + relativeDays(days) }
}

function relativeDays(days: number): string {
  if (days <= 0) return 'bugün'
  if (days === 1) return 'dün'
  return `${days} gün önce`
}

// ============================================================
// RESMİ KAPANIŞIN METNİ
// ============================================================

/**
 * "Son teslime ne kadar kaldı?" — TEK yanıt yeri (R7-06.06).
 *
 * Belgenin açık şartı: *"Aynı verinin farklı kartlarda çelişkili metin
 * üretmesine izin verilmemeli."* Bu yüzden fonksiyon lib'de: aynı
 * `due_at` hem Genel Bakış "Bu Hafta" kartında, hem Haftalık Akış
 * ekranında, hem öğrencinin Haftam ekranında basılıyor.
 *
 * İLERİ YÖNLÜ ve bu onu `relativeDays`/`formatRelativeTr`'den ayıran
 * şey: ikisi de geçmişe bakar ("2 gün önce"), burada sorulan ise
 * gelecek. Aynı fonksiyona iki yön sığdırmak, "bugün"ün hangi anlamda
 * söylendiğini yine belirsiz bırakırdı.
 *
 * SAAT GÖSTERİLİYOR, çünkü kapanış saatli bir andır: Pazar 10:00'da
 * kapanan bir haftada "yarın" demek, 23:00'te teslim edilebileceğini
 * ima ederdi. Gün sayısı ise YEREL GÜN farkından hesaplanır
 * (Europe/Istanbul) — saat farkını 24'e bölmek, akşam 22:00'de bakan
 * öğrenciye yarın 10:00 için "12 saat" deyip günü hiç söylemezdi.
 */
export function dueLabel(input: { dueAt: Date; now?: Date }): string {
  const now = input.now ?? new Date()
  const clock = formatClock(input.dueAt)

  // Yerel gün farkı — ikisi de YYYY-MM-DD, doğrudan karşılaştırılabilir.
  const dueDay = localDateString(input.dueAt)
  const today = localDateString(now)

  if (dueDay < today) {
    // Kapanış geçmiş: kalan süre diye bir şey yok, mutlak tarih doğru
    // olan tek metin.
    return `Son teslim geçti · ${formatAbsolute(input.dueAt)}`
  }

  if (dueDay === today) {
    // Gün aynı olsa da saat geçmiş olabilir (Pazar 10:00, şimdi 14:00).
    return input.dueAt.getTime() < now.getTime()
      ? `Son teslim geçti · bugün ${clock}`
      : `Bugün ${clock}`
  }

  const days = dayDifference(today, dueDay)
  if (days === 1) return `Yarın ${clock}`
  return `${days} gün kaldı · ${formatAbsolute(input.dueAt)}`
}

/**
 * `20.09.2026 10:00` — SAAT DİLİMİ SABİT.
 *
 * `lib/format.ts`'in `formatDateTimeTr`'i burada kullanılamaz: o
 * fonksiyon çalıştığı ortamın saat dilimini alıyor. Sunucu bileşenleri
 * Vercel'de UTC'de çalıştığı için Pazar 10:00 kapanışı ekranda 07:00
 * görünürdü — bu paketin bu turda DOĞRULANMIŞ maddesi tam olarak o
 * kaymaydı ve geri getirilmemeli.
 */
function formatAbsolute(value: Date): string {
  return value.toLocaleString('tr-TR', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** `10:00` — aynı gerekçeyle saat dilimi sabit. */
function formatClock(value: Date): string {
  return value.toLocaleTimeString('tr-TR', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** İki YYYY-MM-DD arasındaki tam gün sayısı. */
function dayDifference(fromDay: string, toDay: string): number {
  // Saatsiz UTC olarak kurulur: ikisi de aynı biçimde kurulduğu için
  // yaz saati kaymaları farkı etkilemez.
  const from = Date.UTC(
    Number(fromDay.slice(0, 4)),
    Number(fromDay.slice(5, 7)) - 1,
    Number(fromDay.slice(8, 10))
  )
  const to = Date.UTC(
    Number(toDay.slice(0, 4)),
    Number(toDay.slice(5, 7)) - 1,
    Number(toDay.slice(8, 10))
  )
  return Math.round((to - from) / DAY_MS)
}

// ============================================================
// SONRADAN EKLENEN YÜK
// ============================================================

/**
 * Bu yayın "sonradan eklendi" mi? (R7-06.08)
 *
 * ESKİ KURAL VE NEDEN YANLIŞTI: karar akışın AÇILIŞ anıyla
 * karşılaştırılıyordu, bir dakikalık payla. Testte akış 06:38'de açıldı,
 * ilk yük 06:58'de yayınlandı — payı yirmi dakika aştı ve haftanın
 * başlangıç yükü olan 6 çalışma "sonradan eklendi" sayıldı.
 *
 * Pay büyütmek çözüm değil: öğretmen haftayı sabah açıp ödevi akşam
 * planlayabilir, arada geçen süre bir kusur değil normal iş akışı.
 * Yanlış olan EKSEN'di.
 *
 * YENİ KURAL, belgenin kendi tanımı: *"Aktif akışta 0 çalışma varken
 * yapılan ilk yayın başlangıç yükü kabul edilmeli."* Yani ölçüt akışın
 * açılışı değil, o akışa yapılan İLK YAYIN. İlk yayın tanım gereği
 * `firstPublishedAt`'e eşittir, bu yüzden pay da gerekmez — aynı anda
 * yayınlanan partilerin hepsi başlangıç yükü olur.
 *
 * `firstPublishedAt` uydurulmuyor: `student_active_flow_load_view`
 * zaten `MIN(hb.created_at)` olarak hesaplıyor (080).
 */
export function isLateAdded(input: {
  publishedAt: Date | null
  firstPublishedAt: Date | null
}): boolean {
  if (!input.publishedAt || !input.firstPublishedAt) return false
  return input.publishedAt.getTime() > input.firstPublishedAt.getTime()
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
