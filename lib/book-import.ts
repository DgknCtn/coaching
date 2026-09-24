// TOPLU KİTAP İÇE AKTARMA (Faz 5).
//
// SORUN: 3D TYT gibi bir kitabın ~60 alt bölümü bugün TEK TEK, elle
// giriliyor. Her biri için form aç, ad yaz, aralık yaz, kaydet. Bu,
// öğretmenin ürüne girerken ödediği en büyük bedel ve ilk kurulumun
// yarım kalmasının bir numaralı sebebi.
//
// NEDEN DOSYA DEĞİL METİN: CSV ya da Excel yüklemek dosya ayrıştırma,
// kodlama (Türkçe karakter!), sütun eşleme ve hata raporlama demek.
// Öğretmenin elindeki şey ise zaten kitabın içindekiler sayfası — onu
// yazabilir ya da PDF'ten kopyalayabilir. Metin yapıştırmak, öğrenilecek
// hiçbir format olmadan aynı işi görüyor.
//
// BU MODÜL SAF: veritabanı bilmez. Sebebi book-structure.ts ile aynı —
// ayrıştırma mantığı doğrulanabilir olmalı; 3D TYT'nin gerçek içindekiler
// metni bir teste konabilmeli.

export interface ParsedSubsection {
  title: string
  testStart: number
  testEnd: number
  /** Metindeki satır numarası — hata ve önizlemede gösterilir. */
  line: number
}

export interface ParsedChapter {
  title: string
  line: number
  subsections: ParsedSubsection[]
}

export interface ParseIssue {
  line: number
  /** Kullanıcının gördüğü ham satır; hatayı bulmasını kolaylaştırır. */
  text: string
  message: string
}

export interface ParsedBookOutline {
  chapters: ParsedChapter[]
  issues: ParseIssue[]
  /** Üretilecek toplam takip birimi. Öğretmen bunu onaylamadan yazılmaz. */
  totalTests: number
}

/** Bir alt bölümün üst sınırı — add_book_subsection ile aynı (047). */
export const MAX_TESTS_PER_SUBSECTION = 200

/** Tek seferde açılabilecek satır sayısı; yapıştırma kazasına karşı. */
export const MAX_IMPORT_ROWS = 300

/**
 * Bir sayfa bölümünün üst sınırı — `create_page_section` (022) ile AYNI.
 *
 * Sayfa takipli kitapta her fiziksel sayfa bir `book_tests` satırı; 5000
 * sayfalık bir bölüm bir veri girişi hatasıdır ve sessizce 5000 satır
 * açmak yerine erken uyarmak gerekir.
 */
export const MAX_PAGES_PER_SECTION = 1000

// Satır sonundaki aralık: "1-4", "17", "Test 44-48", "test 1 - 4".
// Aralık SONDA aranır; "01. Bölüm Temel Kavramlar" gibi başta numara
// taşıyan başlıklar yanlışlıkla aralık sanılmasın diye.
const RANGE_AT_END = /(?:^|\s)(?:test\s*)?(\d{1,4})\s*(?:-|–|—)\s*(\d{1,4})\s*$/i
const SINGLE_AT_END = /(?:^|\s)(?:test\s*)?(\d{1,4})\s*$/i

/**
 * Düz metin içindekiler listesini bölüm/alt bölüm ağacına çevirir.
 *
 * KURAL TEK CÜMLE: satırın sonunda test aralığı VARSA alt bölümdür, YOKSA
 * bölüm başlığıdır. Öğretmene öğretilecek başka hiçbir şey yok — girinti,
 * numaralandırma, ayraç, hepsi serbest.
 *
 *   01. Bölüm - Temel Kavramlar      <- bölüm (aralık yok)
 *     Temel Kavramlar      1-4       <- alt bölüm, 4 test
 *     Tek-Çift Sayılar     5-8       <- alt bölüm, 4 test
 *     Asal Sayılar         9         <- alt bölüm, tek test
 *
 * HATALAR SATIRI ATLATIR, İŞİ DURDURMAZ: 60 satırlık bir yapıştırmada tek
 * bozuk satır yüzünden her şeyi reddetmek, öğretmeni en baştan başlatır.
 * Sorunlu satırlar `issues` ile raporlanır, gerisi önizlemeye girer.
 */
export function parseBookOutline(input: string): ParsedBookOutline {
  const chapters: ParsedChapter[] = []
  const issues: ParseIssue[] = []
  let totalTests = 0

  const lines = input.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const lineNo = i + 1
    const text = raw.trim()

    if (text === '') continue

    if (chapters.length + countSubsections(chapters) >= MAX_IMPORT_ROWS) {
      issues.push({
        line: lineNo,
        text,
        message: `Tek seferde en fazla ${MAX_IMPORT_ROWS} satır aktarılabilir; kalan satırlar atlandı.`,
      })
      break
    }

    const range = matchRange(text)

    if (!range) {
      // Aralıksız satır: yeni bölüm başlığı.
      const title = cleanTitle(text)
      if (title === '') {
        issues.push({ line: lineNo, text, message: 'Bölüm adı okunamadı.' })
        continue
      }
      chapters.push({ title, line: lineNo, subsections: [] })
      continue
    }

    const current = chapters[chapters.length - 1]
    if (!current) {
      issues.push({
        line: lineNo,
        text,
        message: 'Bu alt bölümün üstünde bir bölüm başlığı yok.',
      })
      continue
    }

    const title = cleanTitle(range.rest)
    if (title === '') {
      issues.push({ line: lineNo, text, message: 'Alt bölüm adı okunamadı.' })
      continue
    }

    const count = range.end - range.start + 1
    if (range.start < 1 || range.end < range.start) {
      issues.push({ line: lineNo, text, message: 'Test aralığı geçersiz.' })
      continue
    }
    if (count > MAX_TESTS_PER_SUBSECTION) {
      issues.push({
        line: lineNo,
        text,
        message: `Bir alt bölüm en fazla ${MAX_TESTS_PER_SUBSECTION} test içerebilir (${count} istendi).`,
      })
      continue
    }

    current.subsections.push({
      title,
      testStart: range.start,
      testEnd: range.end,
      line: lineNo,
    })
    totalTests += count
  }

  // Alt bölümü olmayan bölüm, testsiz kapsayıcı olarak açılırdı — yani
  // kitap haritasında hiçbir işe yaramayan boş bir satır. Uyarı verilir
  // ama satır atılmaz: öğretmen bilerek iskelet kuruyor olabilir.
  for (const ch of chapters) {
    if (ch.subsections.length === 0) {
      issues.push({
        line: ch.line,
        text: ch.title,
        message: 'Bu bölümün altında alt bölüm yok; testsiz açılacak.',
      })
    }
  }

  return { chapters, issues, totalTests }
}

function countSubsections(chapters: ParsedChapter[]): number {
  return chapters.reduce((sum, c) => sum + c.subsections.length, 0)
}

interface RangeMatch {
  start: number
  end: number
  /** Aralık çıkarıldıktan sonra kalan başlık kısmı. */
  rest: string
}

function matchRange(text: string): RangeMatch | null {
  const range = text.match(RANGE_AT_END)
  if (range) {
    return {
      start: Number(range[1]),
      end: Number(range[2]),
      rest: text.slice(0, range.index).trim(),
    }
  }

  const single = text.match(SINGLE_AT_END)
  if (single) {
    const rest = text.slice(0, single.index).trim()
    // "01. Bölüm" ya da "3. Ünite" gibi satırlar tek sayı ile bitmiş
    // GÖRÜNMEZ (sayı başta), ama "Bölüm 2" gibi bir başlık biter. Kalan
    // kısım boşsa ya da yalnız bir bölüm sözcüğüyse bunu alt bölüm
    // saymak, bölüm başlığını 1 testlik alt bölüme çevirirdi.
    if (rest === '' || isChapterWord(rest)) return null
    const n = Number(single[1])
    return { start: n, end: n, rest }
  }

  return null
}

const CHAPTER_WORDS = /^(bölüm|bolum|ünite|unite|kısım|kisim|konu|part|chapter)$/i

function isChapterWord(rest: string): boolean {
  return CHAPTER_WORDS.test(cleanTitle(rest))
}

/**
 * Başlıktaki süs karakterlerini atar: baştaki numaralandırma ("01.", "3)"),
 * ayraçlar ve nokta dizileri (içindekiler sayfalarının klasik dolgusu).
 */
function cleanTitle(text: string): string {
  return text
    .replace(/\.{2,}/g, ' ')          // "Temel Kavramlar......" dolgusu
    .replace(/^[\s\-–—•*]+/, '')      // baştaki madde imleri
    .replace(/^\d{1,3}\s*[.)\]-]\s*/, '') // "01. ", "3) ", "12-"
    .replace(/[\s\-–—:]+$/, '')       // sondaki ayraçlar
    .replace(/\s{2,}/g, ' ')
    .trim()
}


// ============================================================
// SAYFA TAKİPLİ KİTAP (R8)
//
// NEDEN AYRI FONKSİYON, AYRI DİLBİLGİSİ DEĞİL
//
// Satır dilbilgisi birebir aynı: "başlık + sondaki sayı aralığı". Değişen
// tek şey aralığın NE ANLAMA geldiği — test numarası değil sayfa numarası
// — ve bu yüzden yazılan kayıt. `matchRange` ve `cleanTitle` paylaşılıyor;
// öğretmenin öğrenmesi gereken ikinci bir format YOK.
//
// Ayrı fonksiyon olmasının sebebi dönüş ŞEKLİ: test modunda iki katmanlı
// bir ağaç (bölüm -> alt bölüm) var, sayfa modunda DÜZ bir liste. Tek
// fonksiyonda birleştirilseydi her çağıranın dönüşü daraltması gerekirdi.
//
// NEDEN DÜZ
// Sayfa takipli kitapta `book_sections` satırı doğrudan bir sayfa aralığı
// taşır (`page_start`/`page_end`, 022) ve altında alt bölüm yoktur. Bu
// yüzden aralıksız satır burada "bölüm başlığı" değil HATADIR: test
// modunda başlık olan satır, sayfa modunda sayfası belirtilmemiş bir
// bölümdür ve ondan kaç sayfa açılacağı bilinemez.
//
// R8 öncesinde bu ekran sayfa takipli kitaplara hiç açılmıyordu ve
// öğretmen 60 bölümü tek tek elle giriyordu.
// ============================================================

export interface ParsedPageSection {
  title: string
  pageStart: number
  pageEnd: number
  /** Metindeki satır numarası — hata ve önizlemede gösterilir. */
  line: number
}

export interface ParsedPageOutline {
  sections: ParsedPageSection[]
  issues: ParseIssue[]
  /** Üretilecek toplam sayfa satırı. Öğretmen bunu onaylamadan yazılmaz. */
  totalPages: number
}

/**
 * Sayfa takipli kitabın içindekiler listesini bölüm + sayfa aralığına çevirir.
 *
 *   Üçgenler 1-56          <- bölüm, 56 sayfa
 *   Çokgenler 57-98        <- bölüm, 42 sayfa
 *   Çember sf. 99-140      <- "sf." yazımı da kabul
 *
 * HATALAR SATIRI ATLATIR, İŞİ DURDURMAZ — test modundaki kuralla aynı.
 */
export function parsePageOutline(input: string): ParsedPageOutline {
  const sections: ParsedPageSection[] = []
  const issues: ParseIssue[] = []
  let totalPages = 0

  const lines = input.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const lineNo = i + 1
    const text = raw.trim()

    if (text === '') continue

    if (sections.length >= MAX_IMPORT_ROWS) {
      issues.push({
        line: lineNo,
        text,
        message: `Tek seferde en fazla ${MAX_IMPORT_ROWS} satır aktarılabilir; kalan satırlar atlandı.`,
      })
      break
    }

    const range = matchRange(text)

    if (!range) {
      // Test modunda bu satır bir bölüm başlığı olurdu. Burada olamaz:
      // sayfa bölümü sayfa aralığı olmadan açılamaz.
      issues.push({
        line: lineNo,
        text,
        message: 'Bu satırda sayfa aralığı yok; sayfa takipli kitapta her bölüm bir aralık taşımalı.',
      })
      continue
    }

    const title = stripPageWord(cleanTitle(range.rest))
    if (title === '') {
      issues.push({ line: lineNo, text, message: 'Bölüm adı okunamadı.' })
      continue
    }

    if (range.start < 1 || range.end < range.start) {
      issues.push({ line: lineNo, text, message: 'Sayfa aralığı geçersiz.' })
      continue
    }

    const count = range.end - range.start + 1
    if (count > MAX_PAGES_PER_SECTION) {
      issues.push({
        line: lineNo,
        text,
        message: `Bir bölüm en fazla ${MAX_PAGES_PER_SECTION} sayfa olabilir (${count} istendi).`,
      })
      continue
    }

    sections.push({ title, pageStart: range.start, pageEnd: range.end, line: lineNo })
    totalPages += count
  }

  return { sections, issues, totalPages }
}

/**
 * Başlığın sonundaki sayfa KISALTMASINI atar: "Üçgenler sf." -> "Üçgenler".
 *
 * İçindekiler sayfalarında aralık çoğu zaman "sf. 1-56" biçiminde yazılır.
 * `matchRange` yalnız "test" önekini tanıyor; kısaltma başlığın ucunda
 * kalırdı ve her bölüm adı "... sf." diye kaydedilirdi.
 *
 * YALNIZ KISALTMALAR ATILIR, "sayfa" SÖZCÜĞÜ ATILMAZ. İlk yazımda liste
 * `sayfa` ve tek harflik `s`'yi de kapsıyordu ve "Tek Sayfa 99" satırının
 * başlığını "Tek"e düşürüyordu — gerçek bir sözcüğü sessizce silmek,
 * "Üçgenler sayfa" gibi biraz fazla kalmış bir başlıktan daha kötü:
 * ikincisini öğretmen önizlemede görüp düzeltebilir, birincisinde
 * kaybolanın ne olduğunu bilemez.
 *
 * `s.` noktalı hâliyle duruyor çünkü noktalı biçim bir kısaltmadır;
 * noktasız `s` bir sözcüğün son harfi olabilir.
 */
function stripPageWord(title: string): string {
  return title.replace(/[\s.]*\b(?:sf\.?|syf\.?|s\.)$/i, '').trim()
}
