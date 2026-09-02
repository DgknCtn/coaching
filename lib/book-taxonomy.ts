// Kitap havuzunun sınıflandırma sözlüğü (R4 §2, §3).
//
// Kural: Ders, seviye/sınav türü, takip türü ve video desteği listelerinin
// TEK yeri burasıdır. Form, filtre çubuğu ve Zod şeması aynı diziden beslenir;
// liste sonradan genişletildiğinde üç yerde ayrı ayrı güncelleme gerekmez.
//
// `SUBJECTS` bilinçli olarak lib/validation.ts'ten buraya taşındı ve
// R4'ün istediği derslerle genişletildi; validation.ts geriye dönük
// uyum için onu buradan yeniden dışa aktarır.

export const SUBJECTS = [
  'Matematik',
  'Geometri',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Türkçe',
  'Edebiyat',
  'Tarih',
  'Coğrafya',
  'Felsefe',
  'Din Kültürü',
  'İngilizce',
  'Diğer',
] as const

/** Seviye / sınav türü. Sınıf seviyeleri ve sınavlar tek listede tutulur:
 *  koç kitabı ararken ikisini de aynı filtreden seçiyor (R4 §2). */
export const LEVEL_EXAMS = [
  '9. Sınıf',
  '10. Sınıf',
  '11. Sınıf',
  '12. Sınıf',
  'TYT',
  'AYT',
  'TYT+AYT',
  // R6-14: TYMM geçiş dönemi. '1. Aşama' ile 'TYT' AYNI DEĞER DEĞİLDİR ve
  // birbirine eşlenmez — filtrede TYT seçmek 1. Aşama kaynaklarını
  // getirmemeli (kabul #77). Geçiş yıllarında ikisi bir arada yaşar.
  '1. Aşama',
  '2. Aşama',
  'LGS',
  'ALES',
  'DGS',
] as const

/**
 * Öğretim programı (R6-14).
 *
 * Kaynağın hangi müfredata göre üretildiğini seviye/sınav bilgisinden
 * BAĞIMSIZ olarak taşır: bir "11. Sınıf Matematik" kitabı hem 2018 MEB
 * hem TYMM programına göre yazılmış olabilir.
 *
 * Varsayılan bilinçli olarak 'Belirtilmedi'dir. Mevcut kitapların programı
 * başlıklarından tahmin EDİLMEZ; yanlış tahmin filtreleri sessizce bozar.
 */
export const CURRICULUM_PROGRAMS = [
  'Belirtilmedi',
  'Türkiye Yüzyılı Maarif Modeli',
  '2018 MEB Programı',
] as const

export const CURRICULUM_PROGRAM_OPTIONS: { value: string; label: string }[] =
  CURRICULUM_PROGRAMS.map(v => ({ value: v, label: v }))

export type CurriculumProgram = (typeof CURRICULUM_PROGRAMS)[number]

/**
 * Kaynak Türü (R7-02 §6.2).
 *
 * YALNIZ sınıflama, filtre ve kısa kart etiketi içindir. Aynı türden ikinci
 * kitabı ENGELLEMEZ ve hiçbir hesaba girmez: bir kaynağın takip birimi
 * `tracking_mode`, video ilişkisi `video_mode` alanında durur.
 *
 * Varsayılan 'Belirtilmedi'dir. Eski kayıtların türü başlıklarından TAHMİN
 * EDİLMEZ (§11 migration notu); öğretmen Düzenle ile tamamlar.
 */
export const RESOURCE_TYPES = [
  'Belirtilmedi',
  'Soru Bankası',
  'Ders/Konu Anlatım Kitabı',
  'Video Destekli Defter',
  'Çalışma Kitabı/Defteri',
  'Kamp Kitabı',
  'Fasikül',
  'Deneme',
  'Çıkmış Sorular',
  'Föy/Modül',
  'Ders Notu/Konu Özeti',
] as const

export const RESOURCE_TYPE_OPTIONS: { value: string; label: string }[] =
  RESOURCE_TYPES.map(v => ({ value: v, label: v }))

export type ResourceType = (typeof RESOURCE_TYPES)[number]

/**
 * Kaynak Yapısı (R7-02 §6.3).
 *
 *   single — Bölümler doğrudan kaynağın altındadır (Bilgi Sarmal, 345).
 *   multi  — Önce Parça (fasikül/cilt/modül), Bölümler parçanın içinde
 *            yönetilir (MÖF F1-F5, Kondisyon, AllStar).
 *
 * Çok parçalı kaynak TEK kaynaktır: öğrencide tek plan, tek toplam yüzde.
 * Parça yalnız gruplama katmanıdır, takip birimi DEĞİLDİR.
 */
export const STRUCTURE_KINDS = ['single', 'multi'] as const

export const STRUCTURE_KIND_OPTIONS: { value: string; label: string }[] = [
  { value: 'single', label: 'Tek Parça' },
  { value: 'multi', label: 'Çok Parçalı' },
]

export type StructureKind = (typeof STRUCTURE_KINDS)[number]

/**
 * Takip türü (R7-02 §6.5 ile genişletildi).
 *
 * 'test' ve 'page' R4'ten beri vardır ve anlamları DEĞİŞMEDİ. Eklenen üç tür
 * aynı yapıyı kullanır: her birim yine bir `book_tests` satırıdır, yeni tablo
 * gerekmez. Yalnız birimin ADI değişir (bkz. lib/unit-labels.ts).
 */
export const TRACKING_MODES = ['test', 'page', 'section', 'step', 'trial'] as const

export const TRACKING_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'test', label: 'Test ile Takip' },
  { value: 'page', label: 'Sayfa ile Takip' },
  { value: 'section', label: 'Bölüm ile Takip' },
  { value: 'step', label: 'Adım ile Takip' },
  { value: 'trial', label: 'Deneme ile Takip' },
]

/**
 * Video Kullanımı (R7-02 §7.1; eski adı "Video Desteği").
 *
 * Video kitap seviyesinde tanımlanır; test/sayfa başına eşleme bilinçli olarak
 * yapılmaz ve video plan temposuna dahil edilmez (R4 §6). R7'de sorulan soru
 * değişti: "video var mı?" yerine "video NASIL kullanılıyor?".
 *
 *   solution_videos — standart soru bankası: öğrenci çözemediği sorunun
 *                     videosunu açar.
 *   video_course    — VDD / Rehber Matematik / Dr. Biyoloji tipi birlikte
 *                     ders ilerleme akışı.
 *   mixed           — iki kullanım da gerçekten varsa.
 *
 * ESKİ DEĞERLER KÖR OTOMASYONLA DÖNÜŞTÜRÜLMEZ (§11): 'book' ve 'section'
 * kayıtları yerinde durur ve listede "(eski)" etiketiyle okunur kalır.
 * Öğretmen Düzenle ile yeni karşılığını seçer.
 */
export const VIDEO_MODES = [
  'none',
  'solution_videos',
  'video_course',
  'mixed',
  // Geriye dönük (R4): yeni kayıtlarda seçilmez.
  'book',
  'section',
] as const

export const VIDEO_MODE_OPTIONS: { value: string; label: string; legacy?: boolean }[] = [
  { value: 'none', label: 'Yok / Belirtilmedi' },
  { value: 'solution_videos', label: 'Soru Çözüm Videoları' },
  { value: 'video_course', label: 'Video Ders Akışı' },
  { value: 'mixed', label: 'Karma' },
  { value: 'book', label: 'Kitap genelinde var (eski)', legacy: true },
  { value: 'section', label: 'Bölüm bazında var (eski)', legacy: true },
]

/** Video bağlantısının öne çıkarılacağı kullanımlar (§7.1): ders akışında
 *  bağlantı operasyonel olarak gereklidir, soru çözümünde değildir. */
export function videoUrlIsProminent(mode: string | null | undefined): boolean {
  return mode === 'video_course' || mode === 'mixed'
}

/** Kaynağın herhangi bir video ilişkisi var mı? 'none' dışındaki HER değer
 *  (eski 'book'/'section' dahil) video sayılır. */
export function hasVideoUsage(mode: string | null | undefined): boolean {
  return !!mode && mode !== 'none'
}

export type Subject = (typeof SUBJECTS)[number]
export type LevelExam = (typeof LEVEL_EXAMS)[number]
export type TrackingMode = (typeof TRACKING_MODES)[number]
export type VideoMode = (typeof VIDEO_MODES)[number]

/** Baskı yılı filtresi için makul aralık; havuzda hangi yılların bulunduğu
 *  sorgudan gelir, bu yalnızca form için üst/alt sınırdır. */
export const EDITION_YEAR_MIN = 2000
export const EDITION_YEAR_MAX = 2100
