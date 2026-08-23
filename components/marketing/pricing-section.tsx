import Link from 'next/link'
import { Check, ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { BRAND, contactMailto } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { SectionHeading } from './section-heading'

// Fiyatlandırma (SaaS vitrini).
//
// Rakam BİLİNÇLİ olarak yazılmıyor: fiyat henüz netleşmedi ve yanlış bir
// rakamı vitrine koyup sonra yükseltmek, ilk müşterilerde güven kaybı
// yaratır. Kademeler ve sınırlar görünür, fiyat konuşarak belirlenir.
//
// Buradaki öğrenci sınırları şu an YALNIZCA vitrindedir — uygulama
// tarafında zorlanmıyor. Limitleri gerçekten uygulamak için workspaces
// tablosuna plan/limit alanı ve öğrenci ekleme akışında kontrol gerekir.

interface Plan {
  name: string
  audience: string
  limit: string
  features: string[]
  cta: 'register' | 'contact'
  highlighted?: boolean
}

const PLANS: Plan[] = [
  {
    name: 'Başlangıç',
    audience: 'Yeni başlayan koçlar ve özel ders öğretmenleri',
    limit: '10 öğrenciye kadar',
    features: [
      'Kitap havuzu ve kitap haritası',
      'Haftalık plan ve ödev takibi',
      'Öğrenci paneli',
      'Ödev metnini WhatsApp\'a kopyalama',
    ],
    cta: 'register',
  },
  {
    name: 'Koç',
    audience: 'Öğrenci portföyünü tek başına yöneten koçlar',
    limit: '30 öğrenciye kadar',
    features: [
      'Başlangıç planındaki her şey',
      'Veli paneli ve veli davetleri',
      'Plan tempo göstergeleri ve risk analizi',
      'Sayfa bazlı takip ve hedef kapsamı',
      'İlerleme raporu (yazdırılabilir)',
    ],
    cta: 'contact',
    highlighted: true,
  },
  {
    name: 'Kurum',
    audience: 'Kurs, dershane ve eğitim kurumları',
    limit: 'Sınırsız öğrenci',
    features: [
      'Koç planındaki her şey',
      'Çoklu öğretmen ve yardımcı hesaplar',
      'Kurum geneli dönem yönetimi',
      'Kitap havuzu yedeği (CSV / JSON)',
      'Öncelikli destek',
    ],
    cta: 'contact',
  },
]

export function PricingSection() {
  return (
    <section
      id="fiyatlar"
      className="scroll-mt-16 border-y bg-muted/30 px-6 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Fiyatlandırma"
          title="Öğrenci sayınıza göre"
          description="10 öğrenciye kadar ücretsiz kullanın. Portföyünüz büyüdüğünde konuşalım — fiyatı öğrenci sayınıza ve ihtiyacınıza göre birlikte belirleyelim."
        />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                'flex flex-col rounded-lg border bg-card p-6 transition-colors',
                plan.highlighted
                  ? 'border-primary shadow-lg shadow-primary/10 md:-my-2 md:py-8'
                  : 'hover:border-primary/40'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{plan.name}</h3>
                {plan.highlighted && (
                  <span className="rounded-sm bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    En çok tercih edilen
                  </span>
                )}
              </div>

              <p className="mt-1.5 text-sm text-muted-foreground">{plan.audience}</p>

              <p className="mt-5 text-xl font-semibold tracking-tight">{plan.limit}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {plan.cta === 'register' ? 'Ücretsiz' : 'Fiyat için görüşelim'}
              </p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-success-foreground" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                {plan.cta === 'register' ? (
                  <Link
                    href="/register"
                    className={buttonVariants({ className: 'w-full' })}
                  >
                    Ücretsiz Başla
                    <ArrowRight />
                  </Link>
                ) : (
                  <a
                    href={contactMailto(`${BRAND.name} — ${plan.name} planı hakkında`)}
                    className={buttonVariants({
                      variant: plan.highlighted ? 'default' : 'outline',
                      className: 'w-full',
                    })}
                  >
                    İletişime geç
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Tüm planlarda öğrenci ve veli hesapları ücretsizdir — yalnızca öğretmen
          tarafı ücretlendirilir.
        </p>
      </div>
    </section>
  )
}
