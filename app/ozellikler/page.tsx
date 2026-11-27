import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Navbar } from '@/components/marketing/navbar'
import { Footer } from '@/components/marketing/footer'
import { StickyCta } from '@/components/marketing/sticky-cta'
import { SectionHeading } from '@/components/marketing/section-heading'
import { GuaranteeStrip } from '@/components/marketing/guarantee-strip'
import { PhonePreview } from '@/components/marketing/phone-preview'
import { FeaturesSection } from '@/components/marketing/features-section'
import { PricingSection } from '@/components/marketing/pricing-section'
import { FaqSection, FAQS } from '@/components/marketing/faq-section'
import { StudentListMock } from '@/components/marketing/mock/student-list-mock'
import { FeatureCategoryGrid } from '@/components/marketing/features/category-grid'
import { FeatureCategoryNav } from '@/components/marketing/features/category-nav'
import { FeatureDetailSection } from '@/components/marketing/features/detail-section'
import { FeatureScreenshot } from '@/components/marketing/features/feature-screenshot'
import { FeatureWorkflow } from '@/components/marketing/features/feature-workflow'
import { TrackInView, TrackOnMount, TrackedLink } from '@/components/marketing/features/tracking'
import { publicCategories, publicFeatures } from '@/lib/features/catalog'
import { TRIAL_CTA_LABEL } from '@/lib/plans'
import { registerHref } from '@/lib/signup-source'
import { siteUrl } from '@/lib/brand'

// İZ ÖZELLİKLERİ — Feature Showcase PRD (/ozellikler).
//
// Tüm içerik lib/features/catalog.ts'ten: yeni bir özellik `available`
// yapıldığında bu sayfa kendiliğinden güncellenir. Planlanan özellikler
// burada GÖRÜNMEZ (PRD Risk 2). Fiyat, anasayfadaki AYNI PricingSection —
// ikinci bir fiyat kaynağı yok (PRD §7.3 Section 16).

const TITLE = 'İZ Özellikleri | Öğrenci, Ödev ve Kitap Takibi'
const DESCRIPTION =
  'İZ ile öğrenci yönetimi, haftalık ödev planı, kitap takibi, veli paneli, görüşme ve finans süreçlerini tek platformda yönetin.'

export const metadata: Metadata = {
  // Kök düzenin "%s · İZ" şablonu başlığa ikinci kez marka eklemesin.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/ozellikler' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/ozellikler', type: 'website' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

function StructuredData() {
  const base = siteUrl()
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Ana sayfa', item: `${base}/` },
          { '@type': 'ListItem', position: 2, name: 'Özellikler', item: `${base}/ozellikler` },
        ],
      },
      {
        '@type': 'ItemList',
        name: 'İZ özellikleri',
        itemListElement: publicFeatures().map((f, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: f.title,
          description: f.benefit,
          url: `${base}/ozellikler#${f.slug}`,
        })),
      },
    ],
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}

export default function FeaturesPage() {
  const categories = publicCategories()
  return (
    <div id="top" className="min-h-screen">
      <StructuredData />
      <TrackOnMount payload={{ event: 'features_page_view', page: 'features' }} />
      <Navbar />

      <main>
        {/* 1 — HERO */}
        <section className="relative overflow-hidden border-b pt-28 pb-16 sm:pt-32">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--primary)_0%,transparent_70%)] opacity-[0.08]"
          />
          <div className="relative mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-3xl text-center">
              <p className="mx-auto inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" />
                Özellikler
              </p>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Öğrenci takibi için ihtiyaç duyduğunuz her şey, tek yerde.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
                İZ; özel ders öğretmenlerinin ve eğitim koçlarının öğrencilerini, ödevlerini, kitap ilerlemelerini,
                görüşmelerini ve eğitim operasyonlarını tek bir sistemde yönetmesini sağlar.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <TrackedLink
                  href={registerHref('ozellikler')}
                  payload={{ event: 'feature_trial_click', cta: 'hero', page: 'features' }}
                  className={buttonVariants({ size: 'lg' })}
                >
                  {TRIAL_CTA_LABEL}
                  <ArrowRight />
                </TrackedLink>
                <TrackedLink
                  href="/demo"
                  payload={{ event: 'feature_demo_click', cta: 'hero', page: 'features' }}
                  className={buttonVariants({ variant: 'outline', size: 'lg' })}
                >
                  Demoyu Gör
                </TrackedLink>
              </div>
              <GuaranteeStrip className="mt-5" />
            </div>

            <div className="relative mx-auto mt-14 max-w-5xl lg:pr-72">
              <FeatureScreenshot caption="Koç paneli: öğrenci durumu, gerekçesi ve ilerlemesi" category="ogrenci-yonetimi">
                <StudentListMock />
              </FeatureScreenshot>
              <PhonePreview className="absolute -bottom-6 right-0 hidden lg:block" />
            </div>
          </div>
        </section>

        {/* 2 — KATEGORİLER */}
        <section className="px-6 py-16 md:py-20">
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              eyebrow="Kategoriler"
              title="İhtiyacınıza göre keşfedin"
              description="Bir kategori seçin; özelliği, faydasını ve uygulamadaki ekranını görün."
            />
            <div className="mt-10">
              <FeatureCategoryGrid />
            </div>
          </div>
        </section>

        <FeatureCategoryNav items={categories.map(c => ({ slug: c.slug, name: c.name }))} />

        {/* 3–12 — KATEGORİ DETAYLARI (katalogdan) */}
        {categories.map((c, i) => (
          <FeatureDetailSection key={c.id} category={c} index={i} />
        ))}

        {/* 13 — TÜM ROLLER */}
        <div className="border-t">
          <FeaturesSection />
        </div>

        {/* 14 — İŞ AKIŞI */}
        <section aria-labelledby="akis-baslik" className="border-t bg-muted/30 px-6 py-20 md:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-medium uppercase tracking-wider text-primary">İş akışı</p>
              <h2 id="akis-baslik" className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                İZ’de süreç baştan sona nasıl işler?
              </h2>
            </div>
            <div className="mt-12">
              <FeatureWorkflow />
            </div>
          </div>
        </section>

        {/* 15 — DEMO */}
        <section className="px-6 py-20 md:py-24">
          <div className="mx-auto max-w-3xl rounded-2xl border bg-card px-6 py-12 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">İZ’i kullanmadan önce kendiniz görün.</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Kayıt olmadan örnek verilerle koç, öğrenci ve veli ekranlarını gezin.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <TrackedLink
                href="/demo"
                payload={{ event: 'feature_demo_click', cta: 'demo-bolumu', page: 'features' }}
                className={buttonVariants({ size: 'lg', variant: 'outline' })}
              >
                Kayıtsız Demoyu Gör
              </TrackedLink>
              <TrackedLink
                href={registerHref('ozellikler')}
                payload={{ event: 'feature_trial_click', cta: 'demo-bolumu', page: 'features' }}
                className={buttonVariants({ size: 'lg' })}
              >
                {TRIAL_CTA_LABEL}
              </TrackedLink>
            </div>
          </div>
        </section>

        {/* 16 — FİYAT (anasayfayla AYNI bileşen) */}
        <TrackInView payload={{ event: 'feature_pricing_view', page: 'features' }} />
        <PricingSection />

        {/* 17 — SSS: tam liste */}
        <FaqSection items={FAQS} trackPage="features" />

        {/* 18 — FİNAL CTA */}
        <section className="border-t px-6 py-20 md:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Öğrenci takibinizi bugün İZ’e taşıyın.
            </h2>
            <p className="mt-3 text-muted-foreground">
              İZ’i kendi öğrencilerinizle deneyin. İlk ödevinizi aynı gün oluşturabilirsiniz.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <TrackedLink
                href={registerHref('ozellikler')}
                payload={{ event: 'feature_trial_click', cta: 'final', page: 'features' }}
                className={buttonVariants({ size: 'lg' })}
              >
                {TRIAL_CTA_LABEL}
                <ArrowRight />
              </TrackedLink>
              <Link href="/demo" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
                Demoyu Gör
              </Link>
            </div>
            <GuaranteeStrip className="mt-6" />
          </div>
        </section>
      </main>

      <Footer />
      <StickyCta />
    </div>
  )
}
