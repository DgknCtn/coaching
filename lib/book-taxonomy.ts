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
  'LGS',
  'ALES',
  'DGS',
] as const

export const TRACKING_MODES = ['test', 'page'] as const

export const TRACKING_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'test', label: 'Test Sayısı ile Takip' },
  { value: 'page', label: 'Sayfa Aralığı ile Takip' },
]

/** Video desteği kitap seviyesinde tanımlanır; test/sayfa başına eşleme
 *  bilinçli olarak yapılmaz ve video plan temposuna dahil edilmez (R4 §6). */
export const VIDEO_MODES = ['none', 'book', 'section'] as const

export const VIDEO_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'Yok' },
  { value: 'book', label: 'Kitap genelinde var' },
  { value: 'section', label: 'Bölüm bazında var' },
]

export type Subject = (typeof SUBJECTS)[number]
export type LevelExam = (typeof LEVEL_EXAMS)[number]
export type TrackingMode = (typeof TRACKING_MODES)[number]
export type VideoMode = (typeof VIDEO_MODES)[number]

/** Baskı yılı filtresi için makul aralık; havuzda hangi yılların bulunduğu
 *  sorgudan gelir, bu yalnızca form için üst/alt sınırdır. */
export const EDITION_YEAR_MIN = 2000
export const EDITION_YEAR_MAX = 2100
