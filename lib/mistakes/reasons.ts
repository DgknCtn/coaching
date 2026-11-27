// Hata nedenleri — migration 161'in CHECK listesiyle AYNI (testli).

export const MISTAKE_REASONS = [
  'bilgi_eksik',
  'kavram_yanilgisi',
  'islem_hatasi',
  'dikkatsizlik',
  'yanlis_okuma',
  'sure_yetmedi',
] as const

export type MistakeReason = (typeof MISTAKE_REASONS)[number]

export const REASON_LABEL: Record<MistakeReason, string> = {
  bilgi_eksik: 'Bilgi eksik',
  kavram_yanilgisi: 'Kavram yanılgısı',
  islem_hatasi: 'İşlem hatası',
  dikkatsizlik: 'Dikkatsizlik',
  yanlis_okuma: 'Soruyu yanlış okuma',
  sure_yetmedi: 'Süre yetmedi',
}

/** En sık nedene göre KALIP öneri (yapay zekâ yok; açıklanabilir). */
export const REASON_ADVICE: Record<MistakeReason, string> = {
  bilgi_eksik: 'En sık nedenin bilgi eksikliği: bu konuların konu anlatımına geri dönmek gerekiyor.',
  kavram_yanilgisi: 'En sık nedenin kavram yanılgısı: tanımları ve temel kuralları koçunla birlikte gözden geçir.',
  islem_hatasi: 'En sık nedenin işlem hatası: işlemleri adım adım yaz, sonucu kontrol etmeye zaman ayır.',
  dikkatsizlik: 'En sık nedenin dikkatsizlik: soru kökünün altını çiz, işaretlemeden önce bir kez daha oku.',
  yanlis_okuma: 'En sık nedenin soruyu yanlış okuma: “değildir, en az, kesinlikle” gibi ifadeleri işaretle.',
  sure_yetmedi: 'En sık nedenin süre: süreli deneme çöz ve takıldığın soruyu sona bırakmayı dene.',
}

export const ANSWERS = ['A', 'B', 'C', 'D', 'E', 'bos'] as const
export type Answer = (typeof ANSWERS)[number]
