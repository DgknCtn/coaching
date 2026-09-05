import {
  LEVEL_EXAMS,
  TRACKING_MODES,
  VIDEO_MODES,
  EDITION_YEAR_MIN,
  EDITION_YEAR_MAX,
} from '@/lib/book-taxonomy'

// KİTAP HAVUZU YEDEĞİNİ GERİ OKUMA — saf ayrıştırıcı.
//
// ============================================================
// NEDEN AYRI BİR DOSYA
//
// "Yedek al" düğmesi 100+ kitaplık bir havuzu JSON'a çıkarıyordu ama geri
// yükleme yoktu: dosya duruyor, kullanıcı onunla hiçbir şey yapamıyordu.
// Bu ayrıştırıcı o dosyayı createBookAction'ın anladığı girdiye çevirir.
//
// SAF VE SUNUCUSUZ: ağ yok, Supabase yok. Böylece arayüz "kaç kitap, kaç
// bölüm, kaç test gelecek" önizlemesini kullanıcı dosyayı seçer seçmez
// gösterebiliyor — içe aktarma geri alınamaz bir işlem ve kullanıcı ne
// olacağını görmeden onaylamamalı. Aynı sebeple ayrıştırıcı ASLA hata
// fırlatmaz: bozuk bir satır bütün dosyayı reddetmek yerine o kitabı
// "atlandı" listesine yazar.
//
// KAPSAM SINIRI — bilinçli:
//   * Alt bölüm hiyerarşisi (parent_section_id) DÜZ LİSTEYE çevrilir.
//     Kitap oluşturma RPC'si hiyerarşi kurmuyor; içeriği kaybetmektense
//     düzleştirmek yeğdir. Arayüz bunu kullanıcıya yazıyor.
//   * Test başlıkları korunmaz, SAYISI korunur. RPC testleri kendi
//     adlandırma kuralıyla üretir; içe aktarılan kitabın testleri elle
//     eklenmiş bir kitabınkiyle aynı görünür.
// ============================================================

/** Bölüm ve kitap üst sınırları — bookSchema ile aynı olmak zorunda. */
export const MAX_SECTIONS_PER_BOOK = 100
export const MAX_TESTS_PER_SECTION = 1000

/** createBookAction'ın beklediği bölüm girdisi. */
export interface BackupSection {
  title: string
  test_count: number
  note?: string
  page_start?: number | null
  page_end?: number | null
}

export interface BackupBook {
  title: string
  subject: string
  publisher?: string
  levelExam?: string
  editionYear?: number | null
  description?: string
  trackingMode: string
  videoMode: string
  videoUrl?: string
  sections: BackupSection[]
  /** Önizlemede gösterilecek toplam test sayısı. */
  testCount: number
}

export interface BackupParseResult {
  books: BackupBook[]
  /** Alınamayan kitaplar: "<kitap adı> — <sebep>". */
  skipped: string[]
  /** Dosyanın tamamı okunamadıysa dolu; bu durumda `books` boştur. */
  fatal?: string
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function oneOf(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback
}

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/**
 * Yedek dosyasını okur.
 *
 * Hem "Yedek al"ın ürettiği `{ books: [...] }` sarmalını hem de doğrudan
 * bir kitap dizisini kabul eder — kullanıcı dosyayı elle düzenleyip
 * sarmalı düşürdüyse, biçim yüzünden reddetmek için bir sebep yok.
 */
export function parseBookBackup(text: string): BackupParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return {
      books: [],
      skipped: [],
      fatal: 'Dosya okunamadı. "Yedek al" ile indirilen .json dosyasını seçin.',
    }
  }

  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { books?: unknown })?.books)
      ? (raw as { books: unknown[] }).books
      : null

  if (!list) {
    return {
      books: [],
      skipped: [],
      fatal: 'Dosyada kitap listesi bulunamadı. Bu bir kitap havuzu yedeği değil gibi görünüyor.',
    }
  }

  if (list.length === 0) {
    return { books: [], skipped: [], fatal: 'Dosyada hiç kitap yok.' }
  }

  const books: BackupBook[] = []
  const skipped: string[] = []

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') {
      skipped.push('Adsız kayıt — okunamadı')
      continue
    }
    const row = entry as Record<string, unknown>

    const title = str(row.title, 200)
    const subject = str(row.subject, 80)
    const label = title || 'Adsız kitap'

    // Ad ve ders zorunlu: ikisi olmadan kitap havuzda bulunamaz.
    if (title.length < 2) {
      skipped.push(`${label} — kitap adı eksik`)
      continue
    }
    if (!subject) {
      skipped.push(`${label} — ders alanı eksik`)
      continue
    }

    // Arşivlenmiş kitap yedeğe giriyor ama havuza geri konmaz: kullanıcı
    // onu bir kez bilerek havuzdan çıkardı.
    if (str(row.status, 40) === 'archived') {
      skipped.push(`${label} — arşivlenmiş`)
      continue
    }

    const trackingMode = oneOf(row.tracking_mode, TRACKING_MODES, 'test')

    const rawSections = Array.isArray(row.book_sections) ? row.book_sections : []
    if (rawSections.length === 0) {
      skipped.push(`${label} — bölümü yok`)
      continue
    }

    // Sıra yedekte order_index ile taşınır; dosyadaki dizilime güvenmek,
    // elle düzenlenmiş bir dosyada bölümleri karıştırırdı.
    const ordered = [...rawSections]
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .sort((a, b) => {
        const ai = typeof a.order_index === 'number' ? a.order_index : 0
        const bi = typeof b.order_index === 'number' ? b.order_index : 0
        return ai - bi
      })

    const sections: BackupSection[] = []
    for (const s of ordered) {
      const sectionTitle = str(s.title, 200)
      if (!sectionTitle) continue

      const tests = Array.isArray(s.book_tests) ? s.book_tests.length : 0
      const pageStart = positiveInt(s.page_start)
      const pageEnd = positiveInt(s.page_end)
      const isPageSection =
        trackingMode === 'page' && pageStart !== null && pageEnd !== null && pageEnd >= pageStart

      sections.push({
        title: sectionTitle,
        // Sayfa takipli bölümde testleri RPC sayfa aralığından üretir;
        // test_count göndermek aynı testleri iki kez saydırırdı.
        test_count: isPageSection ? 0 : Math.min(tests, MAX_TESTS_PER_SECTION),
        note: str(s.note, 500) || undefined,
        page_start: isPageSection ? pageStart : null,
        page_end: isPageSection ? pageEnd : null,
      })
    }

    if (sections.length === 0) {
      skipped.push(`${label} — okunabilir bölümü yok`)
      continue
    }
    if (sections.length > MAX_SECTIONS_PER_BOOK) {
      // Kırpmak sessizce eksik bir kitap üretirdi; kullanıcı kitabın
      // yarısının geldiğini fark etmezdi.
      skipped.push(
        `${label} — ${sections.length} bölüm, üst sınır ${MAX_SECTIONS_PER_BOOK}`
      )
      continue
    }

    const editionYear = positiveInt(row.edition_year)

    books.push({
      title,
      subject,
      publisher: str(row.publisher, 120) || undefined,
      levelExam: oneOf(row.level_exam, LEVEL_EXAMS, ''),
      editionYear:
        editionYear !== null && editionYear >= EDITION_YEAR_MIN && editionYear <= EDITION_YEAR_MAX
          ? editionYear
          : null,
      description: str(row.description, 2000) || undefined,
      trackingMode,
      videoMode: oneOf(row.video_mode, VIDEO_MODES, 'none'),
      videoUrl: str(row.video_url, 500) || undefined,
      sections,
      testCount: sections.reduce(
        (n, s) =>
          n +
          (s.page_start != null && s.page_end != null
            ? s.page_end - s.page_start + 1
            : s.test_count),
        0
      ),
    })
  }

  if (books.length === 0 && skipped.length > 0) {
    return { books, skipped, fatal: 'Dosyadaki kitapların hiçbiri içe aktarılamadı.' }
  }

  return { books, skipped }
}

/**
 * Aynı kitabın iki kez girmesini engelleyen anahtar.
 *
 * Ad + yayın + baskı yılı: aynı kitabın farklı baskısı AYRI bir kayıttır
 * (R4 §1B) ve birleştirilmemeli. Karşılaştırma Türkçe'ye duyarlı küçük
 * harfe çevrilerek yapılır — "MATEMATİK" ile "Matematik" aynı kitaptır.
 */
export function bookIdentityKey(
  title: string,
  publisher: string | null | undefined,
  editionYear: number | null | undefined
): string {
  return [
    title.trim().toLocaleLowerCase('tr'),
    (publisher ?? '').trim().toLocaleLowerCase('tr'),
    editionYear ?? '',
  ].join(' ')
}
