// Dashboard durum motoru (R7 / Site Testi 01 §7).
//
// ============================================================
// BU DOSYA NEYİ DEĞİŞTİRİYOR
// ============================================================
// Dashboard bugüne kadar öğrenciyi ETİKETLEMİYORDU; `describeStudentAttention`
// yalnız somut olguyu yazıyordu ("3 geciken çalışma"). R5.5'in §7.2 sınırı
// bunu açıkça yasaklıyordu: *"Ana ekran yorumlayıcı risk/sağlık/düzen puanı
// üretmez."*
//
// R7 / Site Testi 01 bu sınırı KALDIRIYOR ve tersini istiyor: *"Öğretmen elle
// 'Yolunda / Geride' seçmeyecek. Sistem dört veri kümesini birlikte
// okuyacak."* Değişiklik bilinçlidir ve DOKUMANTASYON.md §8'de hangi belgeyle
// geldiği yazılıdır — sessizce yapılsaydı altı ay sonra hangi kuralın geçerli
// olduğunu kimse bilemezdi.
//
// ============================================================
// TEMPO BANDIYLA KARIŞTIRILMAMALI
// ============================================================
// `lib/weekly-flow.ts` · `paceBand()` de dört etiket üretir ama BAŞKA bir
// soruyu yanıtlar: "bu öğrenci haftalık yükü yetiştirir mi?" — yalnız tempo.
//
// Buradaki motor OPERASYON TRİYAJIDIR: teslim yüzdesi, beklenen yüzde,
// temasa kalan süre, gecikmiş ödev ve gecikmiş bildirim BİRLİKTE okunur.
// Öğretmenin sorusu "kimle ilk ilgilenmeliyim?"dir, "hızı yeter mi?" değil.
// İkisi tek fonksiyona sıkıştırılsaydı, biri değiştiğinde diğeri sessizce
// bozulurdu.
//
// SAF: `new Date()` ÇAĞIRMAZ. Zaman hep parametreyle gelir (repo kalıbı:
// lib/weekly-flow.ts, lib/service-structure.ts) — aksi hâlde sınır değerler
// test edilemezdi.

export type StudentStatus = 'yolunda' | 'takip_et' | 'geride' | 'mudahale'

export const STATUS_LABEL: Record<StudentStatus, string> = {
  yolunda: 'Yolunda',
  takip_et: 'Takip Et',
  geride: 'Geride',
  mudahale: 'Müdahale Gerekli',
}

/**
 * Eşikler — TEK yerde ve AYARLANABİLİR.
 *
 * Belgenin kendi notu: *"Bu eşikler ilk sürüm için başlangıç
 * değerleridir. Kodda sabit gömülmek yerine ayarlanabilir konfigürasyon
 * olarak tutulması önerilir."* Bu yüzden karşılaştırmaların içine
 * yazılmadılar; ileride çalışma alanı başına ayarlanacaklarsa
 * değiştirilecek tek yer burasıdır.
 */
export interface StatusThresholds {
  /** "Takip Et": beklenen ilerlemenin bu kadar PUAN altı. */
  watchGapPoints: number
  /** "Geride": beklenen ilerlemenin bu kadar PUAN altı. */
  behindGapPoints: number
  /** "Geride": temasa bu kadar saat kalmışken ilerleme eşiğin altındaysa. */
  contactSoonHours: number
  /** Yukarıdaki kuralın ilerleme eşiği (%). */
  contactSoonMinPercent: number
  /** "Müdahale": temasa bu kadar saatten az kalmış ve belirgin geride. */
  contactImminentHours: number
  /** "Müdahale": durum bildirimi bu kadar saat gecikmişse. */
  checkInCriticalHours: number
  /** "Müdahale": bu kadar risk sinyali BİRLİKTE görüldüyse. */
  combinedSignalCount: number
}

export const STATUS_THRESHOLDS: StatusThresholds = {
  watchGapPoints: 10,
  behindGapPoints: 20,
  contactSoonHours: 48,
  contactSoonMinPercent: 70,
  contactImminentHours: 24,
  checkInCriticalHours: 48,
  combinedSignalCount: 2,
}

const HOUR_MS = 3_600_000

export interface StatusInput {
  /** Teslim edilen / toplam yük × 100. Yük yoksa 0. */
  submittedPercent: number
  /**
   * O ana kadar gelinmiş OLMASI BEKLENEN yüzde.
   *
   * NULL = ölçülemiyor (hafta açılmamış ya da hiç yük yayınlanmamış).
   * Bu durumda tempo boyutu HİÇ DEĞERLENDİRİLMEZ: sıfır yükü sıfır
   * süreye bölüp öğrenciyi geride göstermek, henüz iş verilmemiş
   * öğrenciyi suçlamak olurdu (aynı gerekçe `calculateFlowPace`'in
   * null dönmesinde de var).
   */
  expectedPercent: number | null
  /** Sıradaki temasa kalan süre (ms). Temas planlanmadıysa null. */
  msToNextContact: number | null
  /** Teslim tarihi geçmiş, tamamlanmamış benzersiz çalışma sayısı. */
  overdueWorkCount: number
  /** Durum bildiriminin gecikme süresi (saat). Gecikme yoksa 0. */
  checkInOverdueHours: number
  /** Bu temasın teslim kesim saati geçti mi? */
  submissionCutoffPassed: boolean
}

export interface StatusResult {
  status: StudentStatus
  /**
   * Kararı doğuran sinyaller — ekranda gösterilmese de hata ayıklamada
   * ve testte "neden bu etiket?" sorusunu cevaplar.
   */
  signals: string[]
}

/**
 * Belgedeki dört kuralı sırayla uygular.
 *
 * SIRA ÖNEMLİ ve en ağırdan hafife doğrudur: bir öğrenci hem "20+ puan
 * geride" hem "bildirim 48 saat gecikmiş" olabilir; bu durumda
 * gösterilecek etiket daha acil olandır.
 *
 * §7'nin kuralları:
 *   Yolunda           Beklenen ilerlemeye yakın/üstünde; kritik gecikme
 *                     yok; bildirim gecikmemiş.
 *   Takip Et          Beklenenin ~10-20 puan altında; henüz kritik risk
 *                     yok.
 *   Geride            20+ puan geride VEYA görüşmeye ≤48 saat kalmış ve
 *                     ilerleme <%70 VEYA gecikmiş çalışma var.
 *   Müdahale Gerekli  Teslim kesimi geçmiş ve eksik var; bildirim 48+
 *                     saat gecikmiş; görüşmeye <24 saat ve öğrenci
 *                     belirgin geride; YA DA birden fazla kritik sinyal
 *                     birlikte.
 *
 * SON MADDENİN OKUNUŞU: ilk üç koşulun her biri TEK BAŞINA müdahale
 * demek. "Birden fazla kritik sinyal birlikte" ise bunlardan hiçbiri tek
 * başına oluşmamışken RİSK SİNYALLERİNİN üst üste binmesini yakalar —
 * tek başına "Geride" sayılacak üç işaretten ikisi aynı anda varsa
 * öğrenci artık takip değil müdahale konusudur.
 */
export function computeStudentStatus(
  input: StatusInput,
  thresholds: StatusThresholds = STATUS_THRESHOLDS
): StatusResult {
  const {
    submittedPercent,
    expectedPercent,
    msToNextContact,
    overdueWorkCount,
    checkInOverdueHours,
    submissionCutoffPassed,
  } = input

  // Tempo ölçülemiyorsa fark SIFIR sayılır — yokluk, gerilik değildir.
  const gap = expectedPercent === null ? 0 : expectedPercent - submittedPercent

  const hoursToContact =
    msToNextContact === null ? null : msToNextContact / HOUR_MS

  const contactWithin = (hours: number) =>
    hoursToContact !== null && hoursToContact <= hours

  // --- Tek başına müdahale gerektiren koşullar (§7) ---
  const critical: string[] = []
  if (submissionCutoffPassed && submittedPercent < 100) {
    critical.push('Teslim kesimi geçti, eksik var')
  }
  if (checkInOverdueHours >= thresholds.checkInCriticalHours) {
    critical.push(`Bildirim ${Math.floor(checkInOverdueHours)} saat gecikti`)
  }
  if (contactWithin(thresholds.contactImminentHours) && gap >= thresholds.behindGapPoints) {
    critical.push('Temasa 24 saatten az kaldı ve belirgin geride')
  }

  // --- "Geride" sayılacak risk sinyalleri ---
  // Bunların HER BİRİ tek başına "Geride" demek; İKİSİ birlikte
  // müdahale eşiğini de aşar.
  const risk: string[] = []
  if (gap >= thresholds.behindGapPoints) {
    risk.push(`Beklenenin ${Math.round(gap)} puan altında`)
  }
  if (overdueWorkCount > 0) {
    risk.push(`${overdueWorkCount} geciken çalışma`)
  }
  if (
    contactWithin(thresholds.contactSoonHours) &&
    submittedPercent < thresholds.contactSoonMinPercent
  ) {
    risk.push('Temas yaklaştı, ilerleme yetersiz')
  }

  if (critical.length > 0) {
    return { status: 'mudahale', signals: [...critical, ...risk] }
  }
  if (risk.length >= thresholds.combinedSignalCount) {
    return { status: 'mudahale', signals: risk }
  }
  if (risk.length > 0) {
    return { status: 'geride', signals: risk }
  }

  // --- Takip Et ---
  const watch: string[] = []
  if (gap >= thresholds.watchGapPoints) {
    watch.push(`Beklenenin ${Math.round(gap)} puan altında`)
  }
  // "Yolunda" için belge bildirim gecikmemiş olmayı ŞART koşuyor. 48
  // saati bulmamış bir gecikme kritik değil ama "yolunda" da değil.
  if (checkInOverdueHours > 0) {
    watch.push('Durum bildirimi gecikti')
  }
  if (watch.length > 0) {
    return { status: 'takip_et', signals: watch }
  }

  return { status: 'yolunda', signals: [] }
}

// ============================================================
// BİLDİRİM / NOT SÜTUNU
// ============================================================

export type NoticeKind = 'check_in_late' | 'note' | 'check_in_done' | 'none'

export interface NoticeSignal {
  kind: NoticeKind
  label: string
}

/**
 * Dashboard'un "Bildirim / Not" hücresi (§5).
 *
 * ÖNCELİK SIRASI BELGEDEN: *"gecikmiş bildirim → önemli not → zamanında
 * bildirim."* Üç şey aynı anda doğru olabilir; sütun tek satır ve en
 * acil olanı göstermeli.
 *
 * NOT İÇERİĞİ ASLA DÖNMEZ — yalnız "Not var" (§5 ve §8):
 *   "Not içeriği Dashboard'da gösterilmez. Zoom/Meet ekran paylaşımında
 *    öğretmenin özel notu açığa çıkmamalıdır."
 * Bu yüzden fonksiyon notun METNİNİ parametre olarak bile almaz; alsaydı
 * bir gün birinin onu ekrana basması an meselesi olurdu.
 *
 * `describeStudentAttention` (lib/student-attention.ts) bu sütunun YERİNE
 * GEÇMEZ: o, gecikmiş çalışma ve onay kuyruğunu da karıştırarak tek bir
 * "dikkat" cümlesi üretiyor. Burada istenen yalnız TEMAS ekseni; gecikme
 * ve onay kendi sütunlarında zaten görünüyor.
 */
export function noticeSignal(input: {
  checkInOverdueHours: number
  hasImportantNote: boolean
  hasCheckedIn: boolean
}): NoticeSignal {
  const { checkInOverdueHours, hasImportantNote, hasCheckedIn } = input

  if (checkInOverdueHours > 0) {
    const days = Math.floor(checkInOverdueHours / 24)
    return {
      kind: 'check_in_late',
      label:
        days >= 1
          ? `${days} gün gecikti`
          : `${Math.max(1, Math.floor(checkInOverdueHours))} saat gecikti`,
    }
  }
  if (hasImportantNote) return { kind: 'note', label: 'Not var' }
  if (hasCheckedIn) return { kind: 'check_in_done', label: 'Bildirim yaptı' }
  return { kind: 'none', label: '—' }
}

/**
 * Beklenen ilerleme yüzdesi (§7 "Beklenen ilerleme").
 *
 * *"Çalışma döneminin başlangıcı ile TESLİM KESİM ZAMANI arasındaki süre
 * yüzde olarak hesaplanır."*
 *
 * KESİM ZAMANI, TEMASIN KENDİSİ DEĞİLDİR. Online grup dersinde ödev ders
 * başlangıcından 6 saat önce teslim edilmiş olmalı; §6'nın örneği: ders
 * 20:00 ise kesim 14:00 ve *"gecikme ve durum motoru 20:00 değil 14:00
 * üzerinden çalışır."* Bu pay veri modelinde zaten var —
 * `student_services.submission_offset_minutes` (074) — bu yüzden burada
 * yeni bir kural değil, hazır değer kullanılıyor.
 *
 * Başlangıç yoksa ya da pencere sıfır/negatifse ölçüm YAPILMAZ (null):
 * uydurulmuş bir beklenti, öğretmenin koymadığı bir standarttır.
 */
export function expectedProgressPercent(input: {
  startedAt: Date | null
  submissionCutoffAt: Date | null
  now: Date
}): number | null {
  const { startedAt, submissionCutoffAt, now } = input
  if (!startedAt || !submissionCutoffAt) return null

  const total = submissionCutoffAt.getTime() - startedAt.getTime()
  if (total <= 0) return null

  const elapsed = now.getTime() - startedAt.getTime()
  if (elapsed <= 0) return 0
  if (elapsed >= total) return 100

  return (elapsed / total) * 100
}
