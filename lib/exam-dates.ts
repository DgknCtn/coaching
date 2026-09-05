// SINAV GERİ SAYIMI — LGS ve YKS.
//
// ============================================================
// TARİHLER ELLE YAZILIR, TAHMİN EDİLMEZ
//
// LGS'nin tarihini MEB, YKS'ninkini ÖSYM her yıl ayrı ayrı açıklar;
// türetilebilecek bir kural yok (bazı yıl haziranın ikinci, bazı yıl
// üçüncü hafta sonu). Bu yüzden bilinen tarihler tabloya elle girilir.
//
// TABLO BİTTİĞİNDE UYDURULMAZ, TAHMİN OLDUĞU SÖYLENİR: takvim
// dolduğunda geri sayım kaybolursa öğretmen bunu bir hata sanar; kesin
// olmayan bir tarihi kesinmiş gibi göstermek ise daha kötüsü — sınava
// üç gün varken yanlış sayı gösteren bir rozet, ürüne olan güveni
// tümüyle götürür. Tahmini tarih `estimated` ile işaretlenir ve arayüz
// bunu "~" ile belirtir.
//
// SAAT DİLİMİ: sınavlar Türkiye saatiyle sabah başlar. Tarihler
// +03:00 ofsetiyle yazılıyor ki tarayıcısı başka bir saat diliminde
// olan kullanıcı da aynı geri sayımı görsün.
// ============================================================

export interface ExamDefinition {
  id: 'lgs' | 'yks'
  label: string
  /** Tam ad — ipucu (title) olarak gösterilir. */
  fullName: string
}

export const EXAMS: ExamDefinition[] = [
  { id: 'lgs', label: 'LGS', fullName: 'Liselere Geçiş Sınavı' },
  { id: 'yks', label: 'YKS', fullName: 'Yükseköğretim Kurumları Sınavı' },
]

/**
 * Açıklanmış sınav tarihleri (ISO 8601, +03:00).
 *
 * YENİ YIL AÇIKLANDIĞINDA BURAYA EKLENİR. Tek bir satır; başka hiçbir
 * yerde tarih yazmıyor.
 */
const ANNOUNCED: Record<'lgs' | 'yks', Record<number, string>> = {
  lgs: {
    2026: '2026-06-14T09:30:00+03:00',
    2027: '2027-06-13T09:30:00+03:00',
  },
  yks: {
    2026: '2026-06-20T10:00:00+03:00',
    2027: '2027-06-19T10:00:00+03:00',
  },
}

/**
 * Tabloda olmayan yıl için kaba tahmin: haziranın üçüncü cumartesi
 * (YKS) / ikinci pazarı (LGS). `estimated: true` ile işaretlenir.
 */
function estimate(exam: 'lgs' | 'yks', year: number): string {
  // Haziranın ilk günü ve o günün haftanın kaçıncı günü olduğu.
  const first = new Date(Date.UTC(year, 5, 1))
  const dow = first.getUTCDay() // 0 pazar … 6 cumartesi

  const target = exam === 'lgs' ? 0 : 6 // LGS pazar, YKS cumartesi
  const firstTarget = 1 + ((target - dow + 7) % 7)
  // LGS ikinci, YKS üçüncü hafta.
  const day = firstTarget + (exam === 'lgs' ? 7 : 14)

  const time = exam === 'lgs' ? '09:30:00' : '10:00:00'
  return `${year}-06-${String(day).padStart(2, '0')}T${time}+03:00`
}

export interface NextExam {
  id: 'lgs' | 'yks'
  label: string
  fullName: string
  /** Sınavın başlangıç anı. */
  date: Date
  /** Tarih açıklanmadı, hesaplandı. Arayüz "~" ile gösterir. */
  estimated: boolean
}

/**
 * Bir sınavın SIRADAKİ oturumu.
 *
 * Sınav günü geçtiyse otomatik olarak ertesi yıla geçer — geri sayımın
 * eksiye düşüp "-3 gün" göstermesi, bakımsız bir ekran demektir.
 */
export function nextExam(id: 'lgs' | 'yks', now: Date = new Date()): NextExam {
  const def = EXAMS.find((e) => e.id === id)!
  let year = now.getFullYear()

  // En fazla iki yıl ileri bakılır; sonrasına gerek yok, çünkü tahmin
  // her yıl için üretilebiliyor.
  for (let i = 0; i < 3; i++) {
    const announced = ANNOUNCED[id][year]
    const iso = announced ?? estimate(id, year)
    const date = new Date(iso)

    if (date.getTime() > now.getTime()) {
      return { ...def, date, estimated: !announced }
    }
    year++
  }

  // Buraya düşmek imkânsız (döngü her yıl bir tarih üretiyor); yine de
  // tip güvenliği için son bir değer.
  const date = new Date(estimate(id, year))
  return { ...def, date, estimated: true }
}

export interface Countdown {
  days: number
  hours: number
  minutes: number
  /** Süre doldu (sınav başladı ya da geçti). */
  passed: boolean
}

/**
 * Kalan süre — gün, saat, dakika.
 *
 * AŞAĞI YUVARLANIR: "3 gün 5 saat" kaldıysa gün 3'tür, 4 değil. Yukarı
 * yuvarlamak, sınava kalan süreyi olduğundan uzun göstermek olurdu.
 */
export function countdown(target: Date, now: Date = new Date()): Countdown {
  const ms = target.getTime() - now.getTime()
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, passed: true }

  const totalMinutes = Math.floor(ms / 60_000)
  return {
    days: Math.floor(totalMinutes / (60 * 24)),
    hours: Math.floor(totalMinutes / 60) % 24,
    minutes: totalMinutes % 60,
    passed: false,
  }
}

/**
 * "280g 16sa" / "6g 23s 57d" gibi kısa biçim.
 *
 * DAKİKA YALNIZ SON GÜNLERDE: sınava 280 gün varken dakika göstermek,
 * ekranı her dakika değişen ve hiçbir işe yaramayan bir rakamla
 * meşgul eder. Deneme süresi gibi kısa sayımlarda ise dakika asıl
 * bilgidir — `withMinutes` bunu çağırana bırakır.
 */
export function formatCountdown(c: Countdown, withMinutes = false): string {
  if (c.passed) return 'doldu'

  const parts: string[] = []
  if (c.days > 0) parts.push(`${c.days}g`)
  parts.push(`${c.hours}s`)
  if (withMinutes || c.days === 0) parts.push(`${c.minutes}d`)

  return parts.join(' ')
}
