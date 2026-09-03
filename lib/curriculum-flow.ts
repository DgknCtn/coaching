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
 * BEŞ DURUM, İKİ KATMAN. Ayrım kasıtlıdır:
 *
 *   Kalem bazında türetilen (deriveFlowStatus — SAF, tek kaleme bakar)
 *     passed  (Tamamlandı)    — eğitmen işaretledi, tek SAKLANAN durum
 *     current (Zamanı Geldi)  — başlangıç geldi, eğitmen tamamlamadı
 *     later   (Sonrasında)    — başlangıç tarihi henüz gelmedi
 *
 *   Liste bazında yükseltilen (deriveFlowStatuses — listeye ve dış veriye bakar)
 *     in_progress (İşleniyor) — konuda AÇIK çalışma var; tarihten bağımsızdır,
 *                               öğrenci planın önünde de olabilir
 *     soon        (Yaklaşan)  — başlamamış konulardan SIRADAKİ İLKİ; yalnız
 *                               bir satır bu duruma girer
 *
 * Neden iki katman: `deriveFlowStatus` saf ve kalem bazında kalmak zorunda,
 * çünkü lib/curriculum-signal.ts onu Kitap Haritasındaki müfredat sinyali
 * için kullanıyor ve orada liste bağlamı yok. Sinyal yalnız 'current'e
 * bakar — yeni durumlar o davranışı DEĞİŞTİRMEZ.
 *
 * `endDate` hiçbir duruma girmez: planlanan bitiş tarihinin geçmesi konuyu
 * otomatik Tamamlandı YAPMAZ (MA-08). Bu, kuralın kod düzeyindeki garantisi.
 */
export type FlowStatus = 'passed' | 'in_progress' | 'current' | 'soon' | 'later'

/** deriveFlowStatus'un döndürebileceği alt küme — liste yükseltmesi öncesi. */
export type BaseFlowStatus = Extract<FlowStatus, 'passed' | 'current' | 'later'>

export const FLOW_STATUS_LABEL: Record<FlowStatus, string> = {
  passed: 'Tamamlandı',
  in_progress: 'İşleniyor',
  current: 'Zamanı Geldi',
  soon: 'Yaklaşan',
  later: 'Sonrasında',
}

export function deriveFlowStatus(item: FlowItem, today?: string): BaseFlowStatus {
  if (item.passed) return 'passed'
  const day = today ?? todayDateString()
  return item.startDate > day ? 'later' : 'current'
}

/**
 * Listenin tamamının durumu.
 *
 * İki yükseltme yapar, sırası önemlidir:
 *   1. `activeTopicIds` içindeki konu → 'in_progress'. Açık çalışma tarihi
 *      yener: öğrenci planın önünde çalışıyorsa satır "İşleniyor" görünür.
 *      'passed' bunu da yener — tamamlanmış konu geri açılmaz.
 *   2. Kalan 'later'lardan LİSTE SIRASINDA ilki → 'soon'. Yalnız bir satır.
 *      Hafta eşiği kullanılmadı: 40 haftalık akışta "önümüzdeki 4 hafta"
 *      bazen hiçbir satırı, bazen üçünü yakalar; "sıradaki konu" ise her
 *      akışta tam olarak bir sonrakini gösterir.
 *
 * Anahtar: kalemin `id`'si, yoksa liste indeksi ("yeni-N") — kaydedilmemiş
 * bloklar da haritada yer alır.
 */
export function flowItemKey(item: FlowItem, index: number): string {
  return item.id ?? `yeni-${index}`
}

export function deriveFlowStatuses(
  items: FlowItem[],
  today?: string,
  activeTopicIds?: ReadonlySet<string>
): Map<string, FlowStatus> {
  const out = new Map<string, FlowStatus>()
  let soonAssigned = false

  items.forEach((item, index) => {
    const key = flowItemKey(item, index)
    const base = deriveFlowStatus(item, today)

    if (base === 'passed') {
      out.set(key, 'passed')
      return
    }

    if (item.topicId && activeTopicIds?.has(item.topicId)) {
      out.set(key, 'in_progress')
      return
    }

    if (base === 'later' && !soonAssigned) {
      soonAssigned = true
      out.set(key, 'soon')
      return
    }

    out.set(key, base)
  })

  return out
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

/**
 * Bir bloğu ikiye BÖLER.
 *
 * "Fonksiyonlar 3 hafta" bloğu, öğrenci ilk 2 haftayı bitirip ara verdiğinde
 * "2 hafta (tamamlandı) + 1 hafta" olarak ayrılabilmeli. Bugün bunun tek
 * yolu konuyu silip iki kez elle eklemekti — geçmiş de kaybolurdu.
 *
 * TOPLAM SÜRE VE ZAMAN ARALIĞI DEĞİŞMEZ: ikinci parça, ilkinin bittiği günün
 * ertesinde başlar ve orijinal bitişte biter. Bu yüzden devam blokları
 * KAYMAZ — bölme zincirleme etki yaratmaz.
 *
 * İkinci parça `id: null` ile eklenir ve ADI AYNI KALIR. Kayıtta
 * save_student_curriculum_flow her kalem için upsert_topic çağırdığı için
 * iki satır AYNI topic_id'yi alır; 039 `(student_id, scope_id, topic_id)`
 * unique kısıtını tam da bunun için koymamıştır.
 *
 * `passed` yalnız İLK parçaya taşınır: bölmenin amacı "bir kısmı bitti"
 * demektir; ikinci parça yeni bir iştir.
 */
export function splitItem(items: FlowItem[], itemId: string, firstWeeks: number): FlowItem[] {
  const index = items.findIndex(i => i.id === itemId)
  if (index === -1) return items

  const item = items[index]
  const total = durationWeeks(item)
  // 1 haftalık blok bölünemez ve parçalardan biri boş kalamaz.
  const first = Math.round(firstWeeks)
  if (total < 2 || first < 1 || first >= total) return items

  const firstEnd = endDateFor(item.startDate, first)
  const secondStart = addDays(firstEnd, 1)

  const head: FlowItem = { ...item, endDate: firstEnd }
  const tail: FlowItem = {
    ...item,
    id: null,
    startDate: secondStart,
    endDate: item.endDate,
    passed: false,
    note: null,
  }

  return [...items.slice(0, index), head, tail, ...items.slice(index + 1)]
}

/**
 * Bir bloğu KENDİNDEN SONRAKİYLE birleştirir.
 *
 * Bölmenin tersi; ayrıca şablondan gelen fazla ayrıntılı akışı sadeleştirmek
 * için de kullanılır ("Sayılar" + "Sayı Basamakları" tek blok olsun).
 *
 * Aralık ilkinin başlangıcından ikincinin bitişine uzar — arada boşluk varsa
 * o da yutulur ve devam blokları KAYMAZ. Ad ilkinden gelir: birleştirme
 * "bunu şunun içine al" demektir, yeni bir konu adı üretmez.
 *
 * `passed` yalnız İKİSİ DE tamamlanmışsa korunur; yarısı bitmiş bir blok
 * bütün olarak "Tamamlandı" görünmemeli.
 */
export function mergeWithNext(items: FlowItem[], itemId: string): FlowItem[] {
  const index = items.findIndex(i => i.id === itemId)
  // Son satırın birleşeceği bir sonraki blok yok.
  if (index === -1 || index >= items.length - 1) return items

  const first = items[index]
  const second = items[index + 1]

  const merged: FlowItem = {
    ...first,
    endDate: second.endDate > first.endDate ? second.endDate : first.endDate,
    passed: first.passed && second.passed,
    note: [first.note, second.note].filter(Boolean).join(' · ') || null,
  }

  return [...items.slice(0, index), merged, ...items.slice(index + 2)]
}

// ============================================================
// Özet
// ============================================================

export interface FlowSummary {
  totalWeeks: number
  /** Beş durumun her biri için hafta toplamı. */
  weeksByStatus: Record<FlowStatus, number>
  firstStart: string | null
  lastEnd: string | null
}

/**
 * Akış özeti — ekranın sağ panelindeki toplamlar.
 *
 * Durum haritası DIŞARIDAN alınır (deriveFlowStatuses). Özetin kendi
 * türetmesini yapması, tabloda "İşleniyor" görünen bir satırın özette
 * "Zamanı Geldi" haftasına sayılmasına yol açardı; iki gösterge aynı
 * kaynaktan beslenmek zorunda.
 */
export function summarizeFlow(
  items: FlowItem[],
  statuses: Map<string, FlowStatus>
): FlowSummary {
  const weeksByStatus: Record<FlowStatus, number> = {
    passed: 0,
    in_progress: 0,
    current: 0,
    soon: 0,
    later: 0,
  }

  items.forEach((item, index) => {
    const status = statuses.get(flowItemKey(item, index)) ?? 'later'
    weeksByStatus[status] += durationWeeks(item)
  })

  const starts = items.map(i => i.startDate).sort()
  const ends = items.map(i => i.endDate).sort()

  return {
    totalWeeks: Object.values(weeksByStatus).reduce((a, b) => a + b, 0),
    weeksByStatus,
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
