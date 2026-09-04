import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BRAND } from '@/lib/brand'

// Hukuki metin sayfalarının ortak kabuğu.
//
// Üç metin (aydınlatma, gizlilik, kullanım koşulları) aynı yapıyı
// paylaşıyor; ayrı ayrı yazılsalardı biri güncellenirken diğerlerinin
// başlık/tarih düzeni ayrışırdı.
//
// SON GÜNCELLEME TARİHİ ZORUNLU: hukuki bir metnin ne zaman değiştiği,
// metnin kendisi kadar önemlidir.

export function LegalShell({
  title,
  updatedAt,
  children,
}: {
  title: string
  updatedAt: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {BRAND.name}
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Son güncelleme: {updatedAt}</p>

      <div className="legal-body mt-10 space-y-6 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>

      <p className="mt-16 border-t pt-6 text-sm text-muted-foreground">
        Sorularınız için{' '}
        <a
          href={`mailto:${BRAND.contactEmail}`}
          className="text-primary underline underline-offset-4"
        >
          {BRAND.contactEmail}
        </a>{' '}
        adresine yazabilirsiniz.
      </p>
    </div>
  )
}

/** Metin içi başlık — üç sayfada da aynı görünsün diye burada. */
export function LegalHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pt-4 text-lg font-semibold tracking-tight text-foreground">{children}</h2>
  )
}
