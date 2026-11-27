import { Check } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { featuresOf, type FeatureCategory } from '@/lib/features/catalog'
import { TRIAL_CTA_LABEL } from '@/lib/plans'
import { registerHref } from '@/lib/signup-source'
import { cn } from '@/lib/utils'
import { CATEGORY_ICON } from './icons'
import { FeatureMock, MOCK_LABEL, PHONE_MOCKS } from './feature-mock'
import { FeatureScreenshot } from './feature-screenshot'
import { TrackInView, TrackedLink } from './tracking'

// KATEGORİ DETAY BÖLÜMÜ (PRD §7.3 Section 3–12). Katalogdan üretilir:
// fayda başlığı, açıklama, kategorideki her özellik (kendi anchor'ı ile),
// gerçek bileşenli ekran(lar) ve CTA. Sıra tek/çift kategoride yer değiştirir.

export function FeatureDetailSection({ category, index }: { category: FeatureCategory; index: number }) {
  const Icon = CATEGORY_ICON[category.icon]
  const features = featuresOf(category.id)
  const reversed = index % 2 === 1

  return (
    <section
      id={category.slug}
      aria-labelledby={`${category.slug}-baslik`}
      className={cn('scroll-mt-32 px-6 py-16 md:py-24', reversed && 'bg-muted/30')}
    >
      <TrackInView payload={{ event: 'feature_category_view', category: category.slug, page: 'features' }} />
      <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className={cn(reversed && 'lg:order-2')}>
          <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
            <Icon className="size-3.5" />
            {category.name}
          </p>
          <h2 id={`${category.slug}-baslik`} className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {category.headline}
          </h2>
          <p className="mt-3 leading-relaxed text-pretty text-muted-foreground">{category.lead}</p>

          <div className="mt-8 space-y-6">
            {features.map(f => (
              <div key={f.id} id={f.slug} className="scroll-mt-32">
                <h3 className="text-base font-semibold">
                  {f.title}
                  {f.status === 'beta' && (
                    <span className="ml-2 rounded-full border border-info-border bg-info-subtle px-2 py-0.5 align-middle text-[10px] font-medium text-info-foreground">
                      Beta
                    </span>
                  )}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.benefit}</p>
                <ul className="mt-3 space-y-2">
                  {f.bullets.map(b => (
                    <li key={b} className="flex items-start gap-2 text-sm leading-relaxed">
                      <Check className="mt-0.5 size-4 shrink-0 text-success-foreground" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <TrackedLink
              href={registerHref('ozellikler')}
              payload={{ event: 'feature_trial_click', category: category.slug, cta: 'kategori', page: 'features' }}
              className={buttonVariants({ size: 'sm' })}
            >
              {TRIAL_CTA_LABEL}
            </TrackedLink>
            <TrackedLink
              href="/demo"
              payload={{ event: 'feature_demo_click', category: category.slug, cta: 'kategori', page: 'features' }}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              {category.cta}
            </TrackedLink>
          </div>
        </div>

        <div className={cn('min-w-0 space-y-8', reversed && 'lg:order-1')}>
          {category.mocks.map(m => (
            <FeatureScreenshot
              key={m}
              caption={MOCK_LABEL[m]}
              category={category.slug}
              feature={features[0]?.slug}
              phone={PHONE_MOCKS.has(m)}
            >
              <div className={cn(PHONE_MOCKS.has(m) && 'flex justify-center py-2')}>
                <FeatureMock mock={m} />
              </div>
            </FeatureScreenshot>
          ))}
        </div>
      </div>
    </section>
  )
}
