import { describe, expect, it } from 'vitest'
import {
  parseMarkdown,
  parseInline,
  plainText,
  readingMinutes,
  safeHref,
  type Block,
  type Inline,
} from '@/lib/blog-markdown'

// ============================================================
// BLOG MARKDOWN DÖNÜŞTÜRÜCÜSÜ
//
// NEDEN BU TEST VAR
//
// Blog içeriği yönetim panelinden girilen SERBEST METİN ve public
// sayfada herkese gösteriliyor. Projede markdown kütüphanesi yok;
// dönüştürücü bu depoda yazıldı. Yani doğruluğu da güvenliği de
// başka hiçbir yerde denetlenmiyor.
//
// ASIL KORUNAN ŞEY `safeHref`: bağlantı adresi, yazarın serbest metnine
// gömülü tek "çalıştırılabilir" alan. İzin listesi yaklaşımı
// seçildiği için testin işi yalnız bilinen saldırıları saymak değil,
// İZİN LİSTESİNİN DARALMADIĞINI de doğrulamak.
//
// `dangerouslySetInnerHTML` HİÇ KULLANILMIYOR: çıktı React elemanı,
// metin kaçışı React'in işi. Bu yüzden burada HTML enjeksiyonu değil,
// ŞEMA enjeksiyonu test ediliyor.
// ============================================================

/** Testlerin okunur kalması için: AST'den düz metin çıkarır. */
function text(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.kind) {
        case 'text':
        case 'code':
          return n.value
        default:
          return text(n.children)
      }
    })
    .join('')
}

function firstParagraph(src: string): Inline[] {
  const block = parseMarkdown(src)[0]
  if (!block || block.kind !== 'paragraph') {
    throw new Error(`paragraf beklendi, gelen: ${block?.kind ?? 'hiçbir şey'}`)
  }
  return block.children
}

describe('blog markdown · bloklar', () => {
  it('boş ve tanımsız girdi boş dizi döner', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown(null)).toEqual([])
    expect(parseMarkdown(undefined)).toEqual([])
    expect(parseMarkdown('   \n\n  \n')).toEqual([])
  })

  it('## ve ### başlık olur, seviyesi doğru', () => {
    const blocks = parseMarkdown('## İkinci\n\n### Üçüncü')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 2 })
    expect(blocks[1]).toMatchObject({ kind: 'heading', level: 3 })
    expect(text((blocks[0] as Extract<Block, { kind: 'heading' }>).children)).toBe('İkinci')
  })

  it('tek # başlık DEĞİL — düz metin kalır (sayfadaki h1 başlık alanı)', () => {
    const blocks = parseMarkdown('# Başlık olmamalı')
    expect(blocks[0].kind).toBe('paragraph')
    expect(text(firstParagraph('# Başlık olmamalı'))).toBe('# Başlık olmamalı')
  })

  it('#### desteklenmez — düz metin kalır', () => {
    expect(parseMarkdown('#### Dört')[0].kind).toBe('paragraph')
  })

  it('başlıksız "## " düz metin kalır', () => {
    expect(parseMarkdown('##   ')[0].kind).toBe('paragraph')
  })

  it('boş satırla ayrılan paragraflar ayrı bloklar olur', () => {
    const blocks = parseMarkdown('Birinci paragraf.\n\nİkinci paragraf.')
    expect(blocks).toHaveLength(2)
    expect(blocks.every((b) => b.kind === 'paragraph')).toBe(true)
  })

  it('paragraf içindeki satır sonu tek boşluğa iner', () => {
    expect(text(firstParagraph('İlk satır\nikinci satır'))).toBe('İlk satır ikinci satır')
  })

  it('- ve * sırasız liste olur', () => {
    for (const src of ['- bir\n- iki', '* bir\n* iki']) {
      const block = parseMarkdown(src)[0] as Extract<Block, { kind: 'list' }>
      expect(block.kind).toBe('list')
      expect(block.ordered).toBe(false)
      expect(block.items).toHaveLength(2)
      expect(text(block.items[0])).toBe('bir')
    }
  })

  it('1. sıralı liste olur', () => {
    const block = parseMarkdown('1. bir\n2. iki\n3. üç')[0] as Extract<Block, { kind: 'list' }>
    expect(block.kind).toBe('list')
    expect(block.ordered).toBe(true)
    expect(block.items).toHaveLength(3)
  })

  it('> alıntı olur ve çok satırlı alıntı tek bloğa birleşir', () => {
    const block = parseMarkdown('> ilk\n> ikinci')[0] as Extract<Block, { kind: 'quote' }>
    expect(block.kind).toBe('quote')
    expect(text(block.children)).toBe('ilk ikinci')
  })

  it('kod bloğu içindeki markdown AYRIŞTIRILMAZ', () => {
    const block = parseMarkdown('```\n## başlık değil\n**kalın değil**\n```')[0]
    expect(block).toEqual({ kind: 'codeBlock', value: '## başlık değil\n**kalın değil**' })
  })

  it('kapanmamış kod bloğu sonsuz döngüye girmez, dosya sonuna kadar alır', () => {
    const blocks = parseMarkdown('```\nkapanmadı')
    expect(blocks).toEqual([{ kind: 'codeBlock', value: 'kapanmadı' }])
  })

  it('liste paragrafı böler — araya boş satır gerekmez', () => {
    const blocks = parseMarkdown('Şunlar önemli:\n- bir\n- iki')
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list'])
  })

  it('CRLF satır sonları da ayrıştırılır', () => {
    const blocks = parseMarkdown('## Başlık\r\n\r\nParagraf.')
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph'])
  })
})

describe('blog markdown · satır içi biçimleme', () => {
  it('**kalın** ve *italik* ayrıştırılır', () => {
    const nodes = parseInline('normal **kalın** ve *italik* son')
    expect(nodes.map((n) => n.kind)).toEqual(['text', 'strong', 'text', 'em', 'text'])
  })

  it('`kod` ayrıştırılır ve İÇİNDEKİ yıldızlar biçimleme olmaz', () => {
    const nodes = parseInline('`**düz metin**`')
    expect(nodes).toEqual([{ kind: 'code', value: '**düz metin**' }])
  })

  it('bağlantı ayrıştırılır ve etiketi iç biçimleme taşıyabilir', () => {
    const nodes = parseInline('[**Demo**](/demo)')
    expect(nodes).toHaveLength(1)
    const link = nodes[0] as Extract<Inline, { kind: 'link' }>
    expect(link.kind).toBe('link')
    expect(link.href).toBe('/demo')
    expect(link.children[0].kind).toBe('strong')
  })

  it('etiketi boş bağlantı düz metin kalır', () => {
    expect(parseInline('[](/demo)')).toEqual([{ kind: 'text', value: '[](/demo)' }])
  })

  it('desteklenmeyen görsel sözdizimi YUTULMAZ, düz metin kalır', () => {
    const nodes = parseInline('![alt](/gorsel.png)')
    expect(text(nodes)).toBe('![alt](/gorsel.png)')
  })

  it('tek başına yıldız biçimleme başlatmaz', () => {
    expect(text(parseInline('2 * 3 = 6'))).toBe('2 * 3 = 6')
  })
})

// ============================================================
// GÜVENLİK: BAĞLANTI ŞEMASI
// ============================================================

describe('blog markdown · safeHref izin listesi', () => {
  const IZINLI = [
    '/demo',
    '/blog/bir-yazi',
    '/',
    'https://ornek.com',
    'https://ornek.com/yol?a=1&b=2#parca',
    'mailto:bilgi@ornek.com',
  ]

  it.each(IZINLI)('%s kabul edilir', (href) => {
    expect(safeHref(href)).toBe(href)
  })

  const REDDEDILEN = [
    // Betik şemaları ve harf büyüklüğü kaçışları
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'JAVASCRIPT:alert(1)',
    ' javascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:text/html;base64,PHNjcmlwdD4=',
    'file:///etc/passwd',
    'blob:https://ornek.com/abc',
    // HTML varlığı ile kaçış denemesi
    '&#x6a;avascript:alert(1)',
    '&#106;avascript:alert(1)',
    // Protokolsüz adres: '/' ile başlıyor ama DIŞ siteye gider
    '//ornek.com',
    '//ornek.com/yol',
    // http BİLİNÇLİ olarak dışarıda
    'http://ornek.com',
    // Şema gibi görünen ama izin listesinde olmayan
    'tel:+905551112233',
    'ftp://ornek.com',
    'intent://ornek.com',
    // Eksik/boş
    '',
    '   ',
    'https://',
    'mailto:',
  ]

  it.each(REDDEDILEN)('%s reddedilir', (href) => {
    expect(safeHref(href)).toBeNull()
  })

  it('araya sokulmuş görünmez karakterler reddedilir', () => {
    // Sekme, satır sonu, satır başı, sıfır genişlikli boşluk ve NUL.
    const kacislar = [
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'java\rscript:alert(1)',
      'java\u0000script:alert(1)',
      'java\u200bscript:alert(1)',
      'https://ornek.com/\u2028yol',
      'https://ornek.com/\ufeffyol',
    ]
    for (const href of kacislar) {
      expect(safeHref(href), href).toBeNull()
    }
  })

  it('güvenli olmayan bağlantı AST\'de bağlantı olmaz, ham metin kalır', () => {
    const nodes = parseInline('[tıkla](javascript:alert(1))')
    expect(nodes.some((n) => n.kind === 'link')).toBe(false)
    // Metin kaybolmuyor: yazar bağlantısının çalışmadığını görüyor.
    expect(text(nodes)).toContain('javascript:alert(1)')
  })

  it('izin listesi daralmadı — site içi, https ve mailto hâlâ bağlantı', () => {
    for (const href of ['/demo', 'https://ornek.com', 'mailto:a@b.com']) {
      const nodes = parseInline(`[etiket](${href})`)
      expect(nodes[0].kind, href).toBe('link')
    }
  })
})

describe('blog markdown · düz metin ve okuma süresi', () => {
  it('plainText biçimleme işaretlerini atar', () => {
    expect(plainText('## Başlık\n\n**kalın** ve *italik* ve `kod`')).toBe(
      'Başlık\n\nkalın ve italik ve kod'
    )
  })

  it('plainText bağlantı etiketini korur, adresini atar', () => {
    expect(plainText('[Demoyu dene](/demo) hemen')).toBe('Demoyu dene hemen')
  })

  it('okuma süresi en az 1 dakika', () => {
    expect(readingMinutes('')).toBe(1)
    expect(readingMinutes('tek kelime')).toBe(1)
  })

  it('okuma süresi 200 kelime/dakika üzerinden hesaplanır', () => {
    expect(readingMinutes(Array.from({ length: 600 }, () => 'kelime').join(' '))).toBe(3)
  })
})
