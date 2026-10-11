import { publishedTestimonials } from '@/lib/testimonials'
import { SectionHeading } from './section-heading'

// KULLANICI SÖZLERİ — yalnız gerçek ve izinli (lib/testimonials.ts).
// Liste boşsa bölüm hiç çizilmez: boş bir "yorumlar" alanı, hiç olmamasından
// daha az güven verir.

const ROLE_LABEL = {
  öğrenci: 'Öğrenci',
  veli: 'Veli',
  koç: 'Koç',
  öğretmen: 'Öğretmen',
} as const

export function TestimonialsSection() {
  const items = publishedTestimonials()
  if (items.length === 0) return null

  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="Kullananlar anlatıyor" title="Öğrenciler, veliler ve öğretmenler ne diyor?" />

        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {items.map((t) => (
            <li key={t.quote}>
              <figure className="flex h-full flex-col rounded-lg border bg-card p-6">
                <blockquote className="flex-1 text-sm leading-relaxed text-pretty">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-5 text-sm">
                  <span className="font-medium">{t.displayName}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {ROLE_LABEL[t.role]}
                    {t.detail ? `, ${t.detail}` : ''}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
