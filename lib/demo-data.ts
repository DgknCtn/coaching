// Demo ekranlarının tarih ve dönem bilgisi.
//
// ============================================================
// NEDEN SABİT TARİH YOK
//
// Demo verisi "18 Haziran 2026" gibi elle yazılmış tarihler taşıyordu.
// Yazıldığı gün doğruydu; birkaç ay sonra vitrindeki bütün ödevler
// geçmiş tarihli göründü ve dönem etiketi ("2025–2026") bir önceki
// eğitim yılını gösteriyordu. Satış sayfasında bayat tarih, ürünün
// hâlâ geliştirilip geliştirilmediği sorusunu doğurur.
//
// Tarihleri elle tazelemek aynı sorunu birkaç ay sonra geri getirir;
// bu yüzden hepsi BUGÜNE GÖRE üretiliyor.
//
// STATİK ÜRETİMDE DONAR: /demo bir sunucu bileşeni ve statik
// üretiliyorsa bu tarihler derleme anında hesaplanır. Kabul edilebilir —
// her dağıtımda kendiliğinden tazelenir ve elle bakım gerektirmez.
// ============================================================

const TR_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
]

/** `-3` üç gün önce, `+4` dört gün sonra. Çıktı: "12 Eylül 2026". */
export function demoDate(offsetDays: number, now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + offsetDays)
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * İçinde bulunulan eğitim yılı: "2026–2027".
 *
 * Eğitim yılı eylülde başlıyor; ocak ayında açılan bir demo hâlâ bir
 * önceki eylülde başlayan yılın içindedir.
 */
export function academicYearLabel(now: Date = new Date()): string {
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}–${year + 1}`
}

/** Öğrenci tablosundaki "son aktivite" sütunu için. */
export function demoRelative(daysAgo: number): string {
  if (daysAgo <= 0) return 'Bugün'
  if (daysAgo === 1) return 'Dün'
  return `${daysAgo} gün önce`
}
