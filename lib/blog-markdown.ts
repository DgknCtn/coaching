// BLOG İÇERİĞİ: MARKDOWN -> SAF AĞAÇ (AST).
//
// ============================================================
// NEDEN KENDİ DÖNÜŞTÜRÜCÜMÜZ VE NEDEN JSX DEĞİL
//
// 1) BAĞIMLILIK YOK. `marked`/`remark` ailesi HTML üretir; HTML üretmek
//    `dangerouslySetInnerHTML` demek, o da bir sanitizer (dompurify)
//    demek — iki yeni bağımlılık ve XSS'in tüm yüzeyi. Bu kod tabanında
//    `dangerouslySetInnerHTML`in TEK kullanımı JSON-LD
//    (structured-data.tsx) ve o da kullanıcı girdisi taşımıyor. Blog
//    yazısı kullanıcı girdisi taşıyor; o kapıyı açmanın bedeli
//    kazancından büyük.
//
// 2) ÇIKTI JSX DEĞİL, DÜZ VERİ. Böylece vitest ile test edilebiliyor:
//    projenin test ortamı `node` (vitest.config.ts) ve jsdom/RTL kurulu
//    değil. JSX döndüren bir fonksiyon test edilemez, dolayısıyla
//    güvenlik kuralları da test edilemezdi. Render ayrı dosyada:
//    components/blog/markdown-content.tsx.
//
// 3) SAF TypeScript — `server-only` importu, DOM ya da Node API'si yok.
//    Bu yüzden İSTEMCİDE DE çalışıyor ve yönetim panelindeki "Önizleme"
//    sekmesi sunucuya gitmeden canlı render edebiliyor.
//
// ALT KÜME BİLİNÇLİ OLARAK KÜÇÜK. Desteklenmeyen sözdizimi (tablo,
// görsel, HTML etiketi, tek '#' başlık) SESSİZCE YUTULMAZ — düz metin
// olarak görünür. Yazar yazdığının çıkmadığını hemen görür; yarım
// render edilmiş bir yazıyı fark etmek ise günler sürerdi.
//
// TEK '#' DESTEKLENMİYOR: sayfadaki h1 veritabanındaki `title` alanı.
// İçerikten ikinci bir h1 çıkması hem SEO hem erişilebilirlik hatası.
// ============================================================

export type Inline =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'code'; value: string }
  | { kind: 'link'; href: string; children: Inline[] }

export type Block =
  | { kind: 'heading'; level: 2 | 3; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'quote'; children: Inline[] }
  | { kind: 'codeBlock'; value: string }

const RE_FENCE = /^```/
const RE_HEADING = /^(#{2,3})\s+(.*)$/
const RE_QUOTE = /^>\s?/
const RE_UL = /^[-*]\s+/
const RE_OL = /^\d+\.\s+/

/** Satır yeni bir blok başlatıyor mu? Paragrafın nerede bittiğini belirler. */
function startsBlock(line: string): boolean {
  return (
    RE_FENCE.test(line) ||
    RE_HEADING.test(line) ||
    RE_QUOTE.test(line) ||
    RE_UL.test(line) ||
    RE_OL.test(line)
  )
}

/**
 * BAĞLANTI ADRESİ DENETİMİ — İZİN LİSTESİ, YASAK LİSTESİ DEĞİL.
 *
 * ============================================================
 * Bu fonksiyon bu dosyadaki TEK gerçek güvenlik sınırı.
 *
 * NEDEN YASAK LİSTESİ DEĞİL: "javascript:" aramak yetmez. Saldırgan
 * harf büyüklüğünü değiştirir, araya sekme/satır sonu sokar, HTML
 * varlığı ("&#x6a;") kullanır ya da henüz akla gelmemiş bir kaçış
 * dener; yasak listesi her zaman bir adım geride kalır. İzin listesi
 * ters çalışır: tanımadığı her şeyi reddeder, yani YENİ bir kaçış
 * biçimi de otomatik olarak reddedilir.
 *
 * İZİN VERİLEN ÜÇ BİÇİM:
 *   /bir-yol      site içi bağlantı
 *   https://...   dış bağlantı (http:// BİLİNÇLİ OLARAK YOK — karma
 *                 içerik uyarısı üretir ve CSP'deki
 *                 upgrade-insecure-requests zaten yükseltiyor)
 *   mailto:...    e-posta
 *
 * "//ornek.com" REDDEDİLİR: protokolsüz adres tarayıcıda dış siteye
 * gider ama '/' ile başladığı için site içi sanılabilirdi.
 *
 * Reddedilen bağlantı KAYBOLMAZ: çağıran taraf ham metni (köşeli
 * parantezler dahil) olduğu gibi yazar. Yazar bağlantısının
 * çalışmadığını görür.
 * ============================================================
 */
export function safeHref(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  // Adres İÇİNDE boşluk, satır sonu, sekme ya da etiket karakteri
  // olamaz — hepsi kaçış denemesinin işareti.
  if (/[\s<>"'`\\]/.test(value)) return null

  // Görünmez karakterler de öyle: kontrol karakterleri, sıfır genişlikli
  // boşluklar ve satır/paragraf ayırıcıları.
  //
  // KOD NOKTASI OLARAK DENETLENİYOR, REGEX İLE DEĞİL: regex içine
  // yazılan kaçış dizileri (u-kaçışları) dosyaya HAM kontrol karakteri
  // olarak sızabiliyor. O hâlde regex görünürde doğru, gerçekte bozuk
  // olur ve derleyici "unterminated regular expression" der. Sayıyla
  // karşılaştırmak hem görünür hem bozulmaz.
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    const invisible =
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      (code >= 0x200b && code <= 0x200f) ||
      code === 0x2028 ||
      code === 0x2029 ||
      code === 0xfeff
    if (invisible) return null
  }

  if (value.startsWith('//')) return null
  if (value.startsWith('/')) return value

  const lower = value.toLowerCase()
  if (lower.startsWith('https://') && value.length > 'https://'.length) return value
  if (lower.startsWith('mailto:') && value.length > 'mailto:'.length) return value

  return null
}

/**
 * Satır içi biçimleme. Öncelik sırası önemli:
 * kod > bağlantı > kalın > italik.
 *
 * Kod en önde çünkü tersevirme (backtick) içindeki yıldızlar biçimleme
 * değil, yazarın göstermek istediği metindir.
 */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let buffer = ''
  let i = 0

  const flush = () => {
    if (buffer) {
      out.push({ kind: 'text', value: buffer })
      buffer = ''
    }
  }

  while (i < src.length) {
    const rest = src.slice(i)

    const code = /^`([^`]+)`/.exec(rest)
    if (code) {
      flush()
      out.push({ kind: 'code', value: code[1] })
      i += code[0].length
      continue
    }

    // GÖRSEL SÖZDİZİMİ DESTEKLENMİYOR — ve bu kural bağlantıdan ÖNCE
    // gelmek zorunda. Yoksa "!" düz metne, arkasındaki "[alt](/x.png)"
    // ise BAĞLANTIYA dönüşüyordu: yazarın koyduğu görsel sessizce
    // "alt" yazılı bir bağlantı oluyordu. Desteklenmeyen sözdizimi
    // başka bir şeye dönüşmemeli, olduğu gibi görünmeli.
    const image = /^!\[([^\]]*)\]\(([^)]*)\)/.exec(rest)
    if (image) {
      buffer += image[0]
      i += image[0].length
      continue
    }

    const link = /^\[([^\]]*)\]\(([^)]*)\)/.exec(rest)
    if (link) {
      const href = safeHref(link[2])
      if (href && link[1].trim()) {
        flush()
        out.push({ kind: 'link', href, children: parseInline(link[1]) })
      } else {
        // Güvenli olmayan ya da etiketi boş bağlantı: ham metin olarak kalır.
        buffer += link[0]
      }
      i += link[0].length
      continue
    }

    const strong = /^\*\*([^*]+)\*\*/.exec(rest)
    if (strong) {
      flush()
      out.push({ kind: 'strong', children: parseInline(strong[1]) })
      i += strong[0].length
      continue
    }

    const em = /^\*([^*]+)\*/.exec(rest)
    if (em) {
      flush()
      out.push({ kind: 'em', children: parseInline(em[1]) })
      i += em[0].length
      continue
    }

    buffer += src[i]
    i += 1
  }

  flush()
  return out
}

export function parseMarkdown(src: string | null | undefined): Block[] {
  if (!src) return []

  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()

    if (!line) {
      i += 1
      continue
    }

    if (RE_FENCE.test(line)) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !RE_FENCE.test(lines[i].trim())) {
        body.push(lines[i])
        i += 1
      }
      // Kapanış çiti atlanır; dosya sonunda yoksa döngü zaten bitti.
      i += 1
      blocks.push({ kind: 'codeBlock', value: body.join('\n') })
      continue
    }

    const heading = RE_HEADING.exec(line)
    if (heading && heading[2].trim()) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 2 | 3,
        children: parseInline(heading[2].trim()),
      })
      i += 1
      continue
    }

    if (RE_QUOTE.test(line)) {
      const body: string[] = []
      while (i < lines.length && RE_QUOTE.test(lines[i].trim())) {
        body.push(lines[i].trim().replace(RE_QUOTE, ''))
        i += 1
      }
      blocks.push({ kind: 'quote', children: parseInline(body.join(' ')) })
      continue
    }

    if (RE_UL.test(line) || RE_OL.test(line)) {
      const ordered = RE_OL.test(line)
      const marker = ordered ? RE_OL : RE_UL
      const items: Inline[][] = []
      while (i < lines.length) {
        const current = lines[i].trim()
        if (!marker.test(current)) break
        items.push(parseInline(current.replace(marker, '')))
        i += 1
      }
      blocks.push({ kind: 'list', ordered, items })
      continue
    }

    // Paragraf: boş satıra ya da yeni bir blok başlangıcına kadar.
    // Araya giren satır sonları tek boşluğa iner (markdown davranışı).
    const body: string[] = []
    while (i < lines.length) {
      const current = lines[i].trim()
      if (!current || startsBlock(current)) break
      body.push(current)
      i += 1
    }
    if (body.length > 0) {
      blocks.push({ kind: 'paragraph', children: parseInline(body.join(' ')) })
    } else {
      // Buraya düşmek bir ayrıştırma hatası demek. `i`yi ilerletmeden
      // devam etmek SONSUZ DÖNGÜ olurdu — sunucuyu kilitlerdi.
      i += 1
    }
  }

  return blocks
}

/** Biçimleme işaretleri olmadan düz metin — özet ve JSON-LD için. */
export function plainText(src: string | null | undefined): string {
  const walk = (nodes: Inline[]): string =>
    nodes
      .map((n) => {
        switch (n.kind) {
          case 'text':
          case 'code':
            return n.value
          case 'strong':
          case 'em':
          case 'link':
            return walk(n.children)
        }
      })
      .join('')

  return parseMarkdown(src)
    .map((b) => {
      switch (b.kind) {
        case 'codeBlock':
          return b.value
        case 'list':
          return b.items.map(walk).join(' ')
        case 'heading':
        case 'paragraph':
        case 'quote':
          return walk(b.children)
      }
    })
    .join('\n\n')
    .trim()
}

/**
 * Okuma süresi — dakika.
 *
 * 200 kelime/dakika yetişkin okuma hızı için yaygın kabul.
 * EN AZ 1 döner: "0 dk okuma" yazmak saçma olurdu.
 */
export function readingMinutes(src: string | null | undefined): number {
  const words = plainText(src).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}
