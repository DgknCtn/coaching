// BAŞLIKTAN URL ADRESİ (SLUG) ÜRETME.
//
// ============================================================
// NEDEN ELLE EŞLEME TABLOSU — `toLowerCase()` VE `normalize()` YETMEZ
//
// İki ayrı tuzak var ve ikisi de Türkçe'ye özgü:
//
// 1) `'I'.toLowerCase()` JavaScript'te her zaman `'i'` döner. Türkçe'de
//    'I'nın küçüğü 'ı'dır. `toLocaleLowerCase('tr')` bunu düzeltir ama
//    o zaman da 'I' -> 'ı' olur ve 'ı' ASCII değildir; slug'a giremez.
//    Yani hangi yolu seçersek seçelim ayrı bir eşleme gerekiyor.
//
// 2) `normalize('NFD')` aksanı harften ayırır ve `ü` -> `u` çalışır,
//    AMA `ı` ve `İ` ayrıştırılamaz: `ı` aksanlı bir `i` değil, KENDİ
//    BAŞINA bir harf (U+0131). Aynı şey `ş`/`ğ` için de geçerli değil
//    (onlar ayrışır) — tek bir yönteme güvenmek bu yüzden kırılgan.
//
// Sonuç: eşleme AÇIKÇA, tablo olarak yazılıyor. Okunması ve
// doğrulanması kolay; sessizce yanlış sonuç veren bir zekâ yok.
//
// ÇIKTI 149_blog.sql'deki slug kısıtına UYMAK ZORUNDA:
//   CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length BETWEEN 3 AND 120)
// Bu yüzden sondaki/baştaki tire kırpılıyor ve tireler teklenİyor.
// ============================================================

/** Türkçe harfler ve sık görülen aksanlı harflerin ASCII karşılığı. */
const CHAR_MAP: Record<string, string> = {
  // Türkçe
  İ: 'i', I: 'i', ı: 'i', i: 'i',
  Ş: 's', ş: 's',
  Ğ: 'g', ğ: 'g',
  Ü: 'u', ü: 'u',
  Ö: 'o', ö: 'o',
  Ç: 'c', ç: 'c',
  // Başlıklara kopyala-yapıştır ile sızan yakın akrabalar
  Â: 'a', â: 'a', Î: 'i', î: 'i', Û: 'u', û: 'u',
  É: 'e', é: 'e', È: 'e', è: 'e', Ê: 'e', ê: 'e',
  Á: 'a', á: 'a', À: 'a', à: 'a', Ä: 'a', ä: 'a',
  Ó: 'o', ó: 'o', Ô: 'o', ô: 'o',
  Ú: 'u', ú: 'u',
  Ñ: 'n', ñ: 'n',
  ß: 'ss',
}

/** Slug'da tire sayılan ayırıcılar — tipografik tireler dahil. */
const SEPARATORS = /[\s_/\\.,:;!?'"“”‘’()[\]{}<>+*&%$#@~`^|–—…]/

/**
 * `'İZ ile Öğrenci Takibi Şart'` -> `'iz-ile-ogrenci-takibi-sart'`
 *
 * Boş ya da tamamen sembolden oluşan girdi `''` döndürür — ÇAĞIRAN
 * TARAF KONTROL ETMEK ZORUNDA. Uydurma bir değer ("yazi-1" gibi)
 * üretmek, kullanıcının fark etmediği bir adres demekti.
 */
export function slugify(input: string): string {
  const out: string[] = []

  for (const char of input.trim()) {
    const mapped = CHAR_MAP[char]
    if (mapped !== undefined) {
      out.push(mapped)
      continue
    }
    if (SEPARATORS.test(char)) {
      out.push('-')
      continue
    }
    // ASCII harf/rakam: küçült. Geri kalan her şey (emoji, Kiril,
    // matematik sembolü) ATILIR — slug kısıtı yalnız [a-z0-9-] kabul
    // ediyor ve geçmeyen bir slug veritabanında hata olarak döner.
    const lower = char.toLowerCase()
    if (/^[a-z0-9]$/.test(lower)) out.push(lower)
  }

  return out
    .join('')
    // Üst üste gelen tireleri tekle: "Soru? Cevap!" iki ayırıcı üretir.
    .replace(/-+/g, '-')
    // Baştaki ve sondaki tire kısıtı ihlal eder.
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    // slice sonunda tire kalmış olabilir.
    .replace(/-+$/g, '')
}

/** Veritabanı kısıtının TS tarafındaki aynısı — formda erken uyarı için. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isValidSlug(value: string): boolean {
  return value.length >= 3 && value.length <= 120 && SLUG_PATTERN.test(value)
}
