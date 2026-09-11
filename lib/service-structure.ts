// HİZMET YAPISI — ana temas ve oturum üretimi (R7 / Site Testi 04 Rev.3).
//
// Bu modül SAFTIR: Supabase'e dokunmaz, `new Date()` çağırmaz (şimdi
// değeri hep dışarıdan gelir). Sebebi, buradaki iki kararın ürünün
// omurgasını taşıması:
//
//   1) ANA TEMAS  — Haftalık Akışın ritmini ve varsayılan Son Teslimini
//      üreten hizmet. Yanlış seçilirse öğrencinin bütün haftası yanlış
//      pencereye oturur.
//   2) OTURUM ÜRETİMİ — "ayın takviminde 5 uygun gün varsa 5 hizmet
//      planlanır". Yanlış sayarsa veli yanlış hizmet borcu görür.
//
// İkisi de saf fonksiyon olduğu için testte gerçek takvimlerle
// zorlanabiliyor; ekran ya da RPC içinde gömülü olsalardı ancak elle
// tıklayarak doğrulanabilirlerdi.

import { APP_TIME_ZONE } from '@/lib/homework-status'

/** Haftanın günü ISODOW ile: 1=Pazartesi .. 7=Pazar (074 ile aynı). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  1: 'Pazartesi',
  2: 'Salı',
  3: 'Çarşamba',
  4: 'Perşembe',
  5: 'Cuma',
  6: 'Cumartesi',
  7: 'Pazar',
}

/**
 * Hizmetin bu modül için gereken kısmı.
 *
 * Tablonun tamamı değil: finans bağı, not ve kim oluşturdu gibi alanlar
 * ana temas kararına girmediği için bilinçli olarak dışarıda. Böylece
 * testler gerçekçi kalırken satırın yarısını doldurmak gerekmiyor.
 */
export interface ServiceLike {
  id: string
  kind: 'ders' | 'kocluk'
  participation: 'birebir' | 'grup'
  medium: 'online' | 'yuz_yuze'
  weekday: Weekday
  /** 'HH:MM' — yerel duvar saati (Europe/Istanbul). */
  startTime: string
  plannedDurationMinutes: number
  /** 'YYYY-MM-DD' — bu tarihten önce oturum üretilmez. */
  startDate: string
  /** Son Teslimi ana temas saatinden geriye çeken opsiyonel kaydırma. */
  submissionOffsetMinutes?: number
  status: 'active' | 'passive'
}

/**
 * Ana temas adayının türü.
 *
 * `kind` ve `participation` ayrı kolonlar olduğu için öncelik kuralı
 * ikisinin BİRLEŞİMİNE bakar; tek bir alana bakan bir kural koçluğu
 * gruptan ayıramazdı.
 */
export type ContactKind = 'kocluk' | 'birebir_ders' | 'grup_dersi'

export const CONTACT_KIND_LABEL: Record<ContactKind, string> = {
  kocluk: 'Koçluk',
  birebir_ders: 'Birebir Ders',
  grup_dersi: 'Grup Dersi',
}

/**
 * ÖNCELİK: Koçluk > Birebir Ders > Grup Dersi (§5).
 *
 * Küçük sayı = yüksek öncelik. Dizi sırasına değil açık bir sayıya
 * bağlanıyor; sıralama mantığı okunduğunda kuralın kendisi görünsün.
 */
const CONTACT_PRIORITY: Record<ContactKind, number> = {
  kocluk: 0,
  birebir_ders: 1,
  grup_dersi: 2,
}

export function contactKindOf(service: ServiceLike): ContactKind {
  if (service.kind === 'kocluk') return 'kocluk'
  return service.participation === 'grup' ? 'grup_dersi' : 'birebir_ders'
}

/**
 * Haftalık Akışın ana teması.
 *
 * ÖĞRETMENE SEÇTİRİLMEZ (§5): sistem aktif hizmetlerden türetir. Seçim
 * sunulsaydı iki öğretmen aynı hizmet setinde farklı haftalık ritim
 * kurar ve "koçluk varken neden grup dersi kapanış üretti?" sorusu
 * cevapsız kalırdı.
 *
 * EŞİTLİK BOZUCU: aynı öncelikte birden çok hizmet varsa haftanın en
 * erken slotu kazanır (gün, sonra saat). Rastgele ya da ekleme sırasına
 * bağlı bir seçim, veri değişmeden ana temasın değişmesine yol açardı.
 *
 * Pasif hizmetler hiç yarışmaz — geçmişi taşırlar, geleceği kurmazlar.
 */
export function deriveMainContact(services: ServiceLike[]): ServiceLike | null {
  const active = services.filter((s) => s.status === 'active')
  if (active.length === 0) return null

  return active.reduce((best, candidate) => {
    const bestRank = CONTACT_PRIORITY[contactKindOf(best)]
    const candidateRank = CONTACT_PRIORITY[contactKindOf(candidate)]
    if (candidateRank !== bestRank) return candidateRank < bestRank ? candidate : best

    if (candidate.weekday !== best.weekday) {
      return candidate.weekday < best.weekday ? candidate : best
    }
    return candidate.startTime < best.startTime ? candidate : best
  })
}

// ============================================================
// ZAMAN: yerel duvar saatinden gerçek ana
// ============================================================
// Hizmet "Çarşamba 20:00" der; bu bir DUVAR SAATİDİR. `new Date(...)`
// ile kurulan bir tarih sunucunun saat dilimine göre kayar ve Vercel'de
// UTC çalışıldığı için ders 3 saat erken görünür. Bu yüzden dönüşüm
// Intl üzerinden, açıkça Europe/Istanbul ile yapılır.

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Verilen an için bölgenin UTC'ye göre kayması (ms). */
function zoneOffsetMs(instant: Date): number {
  const parts = offsetFormatter.formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  // `hour` 24 dönebilir (en-US + hour12:false, gece yarısı); 0'a indir.
  const hour = get('hour') % 24
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second')
  )
  return asUtc - instant.getTime()
}

/**
 * Yerel duvar saatini gerçek ana (UTC) çevirir.
 *
 * İKİ AŞAMA: ilk tahmin UTC varsayar, sonra o anın gerçek kayması ile
 * düzeltilir. Türkiye 2016'dan beri sabit UTC+3 olduğu için tek geçiş
 * yeterdi; ikinci geçiş yaz saati uygulaması geri gelirse ya da kural
 * başka bir bölgeye taşınırsa doğru kalsın diye duruyor.
 */
function zonedWallTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  let ts = guess - zoneOffsetMs(new Date(guess))
  ts = guess - zoneOffsetMs(new Date(ts))
  return new Date(ts)
}

function parseTime(startTime: string): { hour: number; minute: number } {
  const [h, m] = startTime.split(':')
  return { hour: Number(h), minute: Number(m) }
}

/** 'YYYY-MM-DD' -> [yıl, ay, gün]. */
function parseDate(value: string): [number, number, number] {
  const [y, m, d] = value.split('-').map(Number)
  return [y, m, d]
}

/** ISODOW (1=Pazartesi..7=Pazar) — JS'in 0=Pazar'ından farklı. */
function isoWeekday(year: number, month: number, day: number): Weekday {
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return (jsDay === 0 ? 7 : jsDay) as Weekday
}

/** Bir ayın gün sayısı. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Hizmetin verilen aydaki TÜM planlanan oturumları.
 *
 * "AYLIK PAKET = 4 GÖRÜŞME" VARSAYIMI YOKTUR (§8): ay 5 Çarşamba
 * içeriyorsa 5 oturum üretilir. Sabit 4 varsayılsaydı beş haftalık
 * aylarda verilen bir hizmet hiçbir yere yazılmaz, veli eksik görürdü.
 *
 * `startDate` öncesi hiç üretilmez — hizmet henüz başlamamıştır.
 * Pasif hizmet gelecek üretmez.
 */
export function occurrencesInMonth(
  service: ServiceLike,
  year: number,
  month: number
): Date[] {
  if (service.status !== 'active') return []

  const [sy, sm, sd] = parseDate(service.startDate)
  const { hour, minute } = parseTime(service.startTime)
  const out: Date[] = []

  for (let day = 1; day <= daysInMonth(year, month); day++) {
    if (isoWeekday(year, month, day) !== service.weekday) continue
    // Başlangıç gününün kendisi dahildir.
    if (year < sy) continue
    if (year === sy && (month < sm || (month === sm && day < sd))) continue
    out.push(zonedWallTimeToInstant(year, month, day, hour, minute))
  }

  return out
}

/**
 * `from` anından itibaren hizmetin ilk oturumu.
 *
 * `from` ile TAM AYNI ana denk gelen oturum dahildir: ders saati geldiği
 * anda "sıradaki temas" hâlâ o derstir, bir sonraki haftaya atlamaz.
 *
 * En fazla iki ay taranır — haftalık düzende ilk oturum her zaman 7 gün
 * içindedir; iki ay, ay sınırını ve başlangıç tarihi ileride olan
 * hizmetleri güvenle kapsar.
 */
export function nextOccurrence(service: ServiceLike, from: Date): Date | null {
  let year = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric' }).format(from)
  )
  let month = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, month: '2-digit' }).format(from)
  )

  for (let step = 0; step < 3; step++) {
    const hit = occurrencesInMonth(service, year, month).find(
      (d) => d.getTime() >= from.getTime()
    )
    if (hit) return hit
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return null
}

/**
 * Bir sonraki Haftalık Akışın VARSAYILAN Son Teslimi.
 *
 * KRİTİK AYRIM (§6): bu bir deadline DEĞİL, bir varsayılandır. Aktif
 * akışın tek resmi kapanış otoritesi kendi kesinleşmiş Son Teslim
 * alanıdır; burası yalnız o alanı ilk kez doldurur. Ana temas ertelenir
 * ya da iptal edilirse aktif akışın Son Teslimi KENDİLİĞİNDEN değişmez —
 * karar öğretmenindir.
 *
 * `submissionOffsetMinutes` R7-01'in "grup dersinde ders - 6 saat"
 * önerisinin yumuşatılmış hâli: zorunlu kural değil, hizmet başına
 * opsiyonel kaydırma (varsayılan 0).
 */
export function defaultSubmissionDeadline(
  service: ServiceLike,
  from: Date
): Date | null {
  const next = nextOccurrence(service, from)
  if (!next) return null
  const offset = service.submissionOffsetMinutes ?? 0
  return offset === 0 ? next : new Date(next.getTime() - offset * 60_000)
}

/**
 * Öğrencinin sıradaki teması — hizmet fark etmeksizin en yakın olan.
 *
 * Dashboard'un sıralama ekseni budur (R7-01 §6) ve ana temastan
 * BAĞIMSIZDIR: ana temas Cumartesi koçluk olsa bile Çarşamba grup dersi
 * daha yakınsa öğretmenin sıradaki teması odur. İkisini karıştırmak,
 * "bugün kimi göreceğim" sorusuna yanlış cevap verirdi.
 */
export function nextContact(
  services: ServiceLike[],
  from: Date
): { service: ServiceLike; at: Date } | null {
  let best: { service: ServiceLike; at: Date } | null = null

  for (const service of services) {
    const at = nextOccurrence(service, from)
    if (!at) continue
    if (!best || at.getTime() < best.at.getTime()) best = { service, at }
  }

  return best
}

// ============================================================
// OTURUM DURUMLARI
// ============================================================

export type SessionStatus = 'planlandi' | 'yapildi' | 'ertelendi' | 'iptal' | 'yapilmadi'

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  planlandi: 'Planlandı',
  yapildi: 'Yapıldı',
  ertelendi: 'Ertelendi',
  iptal: 'İptal Edildi',
  yapilmadi: 'Yapılmadı',
}

/**
 * "İptal Edildi" ile "Yapılmadı" AYNI ŞEY DEĞİLDİR (§7).
 *
 * İptal, görüşme ÖNCESİNDE kesinleşmiş bir karardır — taraflar
 * anlaşmıştır. Yapılmadı ise planlanan hizmetin gerçekleşmediğinin
 * SONRADAN kaydıdır ve ardından bir telafi kararı gelir. İkisini tek
 * duruma indirmek, telafi borcunun kaynağını yok ederdi.
 */
export const SESSION_STATUS_HINT: Record<SessionStatus, string> = {
  planlandi: 'Zamanı gelmemiş veya henüz sonuçlandırılmamış oturum.',
  yapildi: 'Hizmet gerçekleşti.',
  ertelendi: 'Eski tarih korunur, yeni tarih aynı kayda bağlıdır.',
  iptal: 'Görüşme öncesinde iptal kararı kesinleşti.',
  yapilmadi: 'Planlanan hizmet gerçekleşmedi; telafi kararı bekliyor.',
}

export const SESSION_STATUS_VARIANT: Record<
  SessionStatus,
  'success' | 'warning' | 'destructive' | 'info' | 'neutral'
> = {
  planlandi: 'neutral',
  yapildi: 'success',
  ertelendi: 'info',
  iptal: 'neutral',
  yapilmadi: 'destructive',
}

/**
 * Saati geçmiş ama hâlâ sonuçlandırılmamış oturum.
 *
 * SİSTEM OTOMATİK "YAPILMADI" DEMEZ (§7.B). Öğretmen dersi yapmış ancak
 * kaydı henüz işaretlememiş olabilir; otomatik işaretleme, gerçekleşmiş
 * bir hizmeti veli ekranında yapılmamış gösterirdi ve aylık hizmet
 * borcunu haksız yere düşürürdü.
 *
 * Bu yüzden "Durum güncellenmedi" bir VERİTABANI DURUMU DEĞİL, yalnız bu
 * okumadır: durum planlandi + zaman geçmiş. Arayüz bunu görünce
 * öğretmene üç işlem sunar: Yapıldı · Yapılmadı · Tarih/Saati Değiştir.
 */
export function isAwaitingOutcome(
  session: { status: SessionStatus; effectiveAt: Date },
  now: Date
): boolean {
  return session.status === 'planlandi' && session.effectiveAt.getTime() < now.getTime()
}

/**
 * Oturumun GEÇERLİ zamanı.
 *
 * Ertelenen oturumda gerçek olan yeni tarihtir; `planned_at` yalnız ilk
 * taahhüdün kaydı olarak durur. Sıralama ve "geçti mi" kararları bu
 * fonksiyondan geçmeli — iki ekran iki farklı kolona bakarsa aynı oturum
 * birinde gecikmiş, diğerinde değil görünür.
 */
export function effectiveSessionTime(session: {
  plannedAt: string | Date
  actualAt?: string | Date | null
}): Date {
  const value = session.actualAt ?? session.plannedAt
  return value instanceof Date ? value : new Date(value)
}

// ============================================================
// GÖSTERİM
// ============================================================
// lib/format.ts'teki biçimlendiriciler saat dilimi BELİRTMEZ; sunucu
// UTC çalıştığı için ders saatleri orada 3 saat kayardı. Görüşme
// zamanları ürünün en hassas sayısı (veli "dersim 20:00'deydi" der), bu
// yüzden burada bölge açıkça yazılıyor.

const sessionTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const sessionDateFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const sessionWeekdayFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  weekday: 'short',
})

const sessionClockFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
})

const sessionLongFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

/** `16.09.2026 20:00` — tablo ve satır içi. */
export function formatSessionTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return sessionTimeFormatter.format(d)
}

/**
 * Aylık kayıt tablosunun üç ayrı sütunu (R7-04 §7 hedef ekran):
 * Tarih · Gün · Saat.
 *
 * ÜÇÜ DE APP_TIME_ZONE ÜZERİNDEN. `at.getDay()` ile gün adı üretmek
 * ÇALIŞTIRAN MAKİNENİN saat dilimini kullanır: sunucu UTC'deyse
 * Çarşamba 00:30'daki bir oturum tabloda "Salı" görünürdü. Aynı tuzak
 * `getHours()` için de geçerli.
 */
export function formatSessionDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return sessionDateFormatter.format(d)
}

export function formatSessionWeekdayShort(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return sessionWeekdayFormatter.format(d)
}

export function formatSessionClock(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return sessionClockFormatter.format(d)
}

/** `16 Eylül Çarşamba 20:00` — kart başlıklarında. */
export function formatSessionLong(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return sessionLongFormatter.format(d)
}

/** `Çarşamba 20:00 · 120 dk` — hizmetin haftalık düzeni. */
export function formatServiceSchedule(service: ServiceLike): string {
  return `${WEEKDAY_LABEL[service.weekday]} ${service.startTime} · ${service.plannedDurationMinutes} dk`
}

/** `Online · Grup · Ders` — hizmetin üç ekseni tek satırda. */
export function formatServiceAxes(service: ServiceLike): string {
  return [
    service.medium === 'online' ? 'Online' : 'Yüz yüze',
    service.participation === 'grup' ? 'Grup' : 'Birebir',
    service.kind === 'kocluk' ? 'Koçluk' : 'Ders',
  ].join(' · ')
}
