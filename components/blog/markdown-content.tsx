import Link from 'next/link'
import { parseMarkdown, type Block, type Inline } from '@/lib/blog-markdown'

// BLOG İÇERİĞİNİN RENDER'I.
//
// ============================================================
// NEDEN `components/blog/` ALTINDA, `components/marketing/` DEĞİL
//
// tests/marketing-parity.test.ts, `components/marketing/**` altındaki
// TÜM kaynağı yasaklı kelime listesiyle tarıyor ("Kritik", "14 gün",
// "%d gün ücretsiz" …). O taramanın amacı vitrindeki SAYILARIN
// lib sabitlerinden okunmasını zorlamak. Blog bileşenleri oraya
// konsaydı tarama iki şeyi birden denetlemeye başlar, kapsamı
// bulanıklaşırdı — ve bir blog başlığında "Kritik" kelimesi geçtiği
// için CI kırılırdı.
//
// NEDEN `dangerouslySetInnerHTML` YOK
//
// Çıktı React elemanı; metin kaçışı React'in kendi işi. Yani yazarın
// yazdığı "<script>" ekranda "<script>" olarak görünür, çalışmaz.
// HTML üretip sanitize etmek yerine hiç HTML üretmemek, güvenlik
// açısından karşılaştırılamayacak kadar sağlam.
//
// Tek "çalıştırılabilir" alan bağlantı adresi ve o lib/blog-markdown.ts
// içindeki `safeHref` izin listesinden geçiyor.
// ============================================================

/** İç bağlantı `next/link`, dış bağlantı yeni sekmede açılır. */
function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  const internal = href.startsWith('/')

  if (internal) {
    return (
      <Link href={href} className="text-primary underline underline-offset-4">
        {children}
      </Link>
    )
  }

  // rel="noopener noreferrer": yeni sekmede açılan dış bağlantı,
  // açan sayfaya `window.opener` üzerinden erişebiliyor.
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-4"
    >
      {children}
    </a>
  )
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        // Anahtar olarak index: ağaç her render'da aynı metinden
        // yeniden üretiliyor, yani sıra kararlı.
        switch (node.kind) {
          case 'text':
            return <span key={index}>{node.value}</span>
          case 'strong':
            return (
              <strong key={index} className="font-semibold text-foreground">
                <Inlines nodes={node.children} />
              </strong>
            )
          case 'em':
            return (
              <em key={index}>
                <Inlines nodes={node.children} />
              </em>
            )
          case 'code':
            return (
              <code
                key={index}
                className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground"
              >
                {node.value}
              </code>
            )
          case 'link':
            return (
              <InlineLink key={index} href={node.href}>
                <Inlines nodes={node.children} />
              </InlineLink>
            )
        }
      })}
    </>
  )
}

function BlockNode({ block }: { block: Block }) {
  switch (block.kind) {
    case 'heading':
      // İçerikte h1 YOK: sayfanın h1'i yazının başlığı. İçerikten ikinci
      // bir h1 çıkması hem SEO hem erişilebilirlik hatası olurdu.
      return block.level === 2 ? (
        <h2 className="mt-10 scroll-mt-20 text-xl font-semibold tracking-tight text-foreground">
          <Inlines nodes={block.children} />
        </h2>
      ) : (
        <h3 className="mt-8 scroll-mt-20 text-base font-semibold tracking-tight text-foreground">
          <Inlines nodes={block.children} />
        </h3>
      )

    case 'paragraph':
      return (
        <p>
          <Inlines nodes={block.children} />
        </p>
      )

    case 'list':
      return block.ordered ? (
        <ol className="list-decimal space-y-2 pl-6">
          {block.items.map((item, index) => (
            <li key={index}>
              <Inlines nodes={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc space-y-2 pl-6">
          {block.items.map((item, index) => (
            <li key={index}>
              <Inlines nodes={item} />
            </li>
          ))}
        </ul>
      )

    case 'quote':
      return (
        <blockquote className="border-l-2 border-primary/40 pl-4 italic">
          <Inlines nodes={block.children} />
        </blockquote>
      )

    case 'codeBlock':
      return (
        // overflow-x-auto: uzun satır sayfayı yatay kaydırmaya zorlamasın.
        <pre className="overflow-x-auto rounded-md border bg-muted/50 p-4 text-[13px] leading-relaxed">
          <code className="font-mono text-foreground">{block.value}</code>
        </pre>
      )
  }
}

/**
 * Markdown metnini sunar.
 *
 * Tipografi hukuki metin kabuğuyla (legal-shell.tsx) aynı ölçekte:
 * gövde muted, vurgu foreground. İki yerde farklı okunan bir gövde
 * metni, aynı sitede iki ürün gibi görünürdü.
 */
export function MarkdownContent({ source }: { source: string | null | undefined }) {
  const blocks = parseMarkdown(source)

  if (blocks.length === 0) return null

  return (
    <div className="space-y-5 text-[15px] leading-relaxed text-muted-foreground">
      {blocks.map((block, index) => (
        <BlockNode key={index} block={block} />
      ))}
    </div>
  )
}
