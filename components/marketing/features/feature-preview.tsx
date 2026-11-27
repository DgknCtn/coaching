import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { categoryOf, featuredFeatures } from '@/lib/features/catalog'
import { SectionHeading } from '../section-heading'
import { CATEGORY_ICON } from './icons'
import { TrackInView, TrackedLink } from './tracking'

// ANASAYFA ÖZELLİK ÖNİZLEMESİ (PRD §8.2–8.3). Katalogdaki `featured`
// özellikler (5–7 kart); her kart /ozellikler'deki ilgili bölüme gider.
// Tüm katalog anasayfada TEKRARLANMAZ.

export function FeaturePreview() {
  const items = featuredFeatures()
  return (
    <section id="ozellik-onizleme" className="scroll-mt-16 px-6 py-20 md:py-28">
      <TrackInView payload={{ event: 'homepage_feature_preview_view', page: 'home' }} />
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Özellikler"
          title="İZ yalnızca ödev takibi değil."
          description="Öğrenci yönetimi, kitap takibi, haftalık plan, öğretmen onayı, veli paneli, görüşme ve finans süreçleri tek yerde."
        />
        <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(f => {
            const c = categoryOf(f)
            const Icon = CATEGORY_ICON[c.icon]
            return (
              <li key={f.id}>
                <TrackedLink
                  href={`/ozellikler#${f.slug}`}
                  payload={{ event: 'homepage_features_cta_click', feature: f.slug, category: c.slug, cta: 'kart', page: 'home' }}
                  className="group flex h-full flex-col rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span className="mt-4 text-sm font-semibold">{f.title}</span>
                  <span className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{f.benefit}</span>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary">
                    Detayları Gör
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </TrackedLink>
              </li>
            )
          })}
          <li>
            <TrackedLink
              href="/ozellikler"
              payload={{ event: 'homepage_features_cta_click', cta: 'tum-ozellikler', page: 'home' }}
              className="flex h-full flex-col items-start justify-center rounded-xl border border-dashed bg-muted/30 p-5 text-sm transition-colors hover:border-primary/40"
            >
              <span className="font-semibold">Ve dahası</span>
              <span className="mt-1.5 text-muted-foreground">E-postasız giriş, toplu kitap aktarma, Google Takvim, öğretmen onayı…</span>
            </TrackedLink>
          </li>
        </ul>
        <div className="mt-10 flex justify-center">
          <TrackedLink
            href="/ozellikler"
            payload={{ event: 'homepage_features_cta_click', cta: 'kesfet', page: 'home' }}
            className={buttonVariants({ size: 'lg', variant: 'outline' })}
          >
            İZ’in Tüm Özelliklerini Keşfet
            <ArrowRight />
          </TrackedLink>
        </div>
      </div>
    </section>
  )
}
