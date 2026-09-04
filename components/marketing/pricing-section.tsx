'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, ArrowRight } from 'lucide-react'
import { buttonVariants, Button } from '@/components/ui/button'
import { BRAND, contactMailto } from '@/lib/brand'
import { PLANS as PLAN_DEFS, TRIAL_DAYS } from '@/lib/plans'
import {
  PLAN_PRICING,
  formatKurus,
  yearlyDiscountPercent,
  yearlyPerMonthKurus,
  type BillingPeriod,
} from '@/lib/billing/pricing'
import { cn } from '@/lib/utils'
import { SectionHeading } from './section-heading'
import { GuaranteeStrip } from './guarantee-strip'

// Fiyatlandırma (SaaS vitrini).
//
// ============================================================
// TAKSİT KALDIRILDI (057), GEÇİŞ DÜĞMESİ GELDİ
//
// Önceden aylık ve yıllık fiyat aynı anda, statik olarak yazılıydı;
// okuyucu iki sayıyı kendi kafasında karşılaştırmak zorundaydı. Geçiş
// düğmesi indirimi ETKİLEŞİMLİ hâle getiriyor: kullanıcı "Yıllık"a
// bastığında rakamın düştüğünü GÖRÜYOR. Bu, aynı bilgiyi vermenin
// belirgin biçimde daha ikna edici yolu.
//
// RAKAMLAR KODDAN OKUNUYOR: lib/billing/pricing.ts. Elle yazılsalardı
// ödeme ekranıyla vitrin ayrışabilir ve müşteri gördüğünden başka bir
// tutarla karşılaşırdı.
//
// YAYINA ÇIKMADAN ÖNCE: bu rakamlar HENÜZ ONAYLANMADI. Yayınlanmış bir
// fiyatı değiştirmek mevcut abonelerin yenileme bedelini de değiştirir.
// ============================================================

interface Plan {
  key: 'starter' | 'coach' | 'institution'
  audience: string
  limit: string
  features: string[]
  cta: 'register' | 'contact'
  highlighted?: boolean
}

const PLANS: Plan[] = [
  {
    key: 'starter',
    audience: 'Yeni başlayan koçlar ve özel ders öğretmenleri',
    limit: '10 öğrenciye kadar',
    features: [
      'Kitap havuzu ve kitap haritası',
      'İçindekilerden toplu kitap aktarma',
      'Haftalık plan ve ödev takibi',
      'Öğrenci paneli',
      'Ödev metnini WhatsApp\'a kopyalama',
    ],
    cta: 'register',
  },
  {
    key: 'coach',
    audience: 'Öğrenci portföyünü tek başına yöneten koçlar',
    limit: '30 öğrenciye kadar',
    features: [
      'Başlangıç planındaki her şey',
      'Veli paneli ve veli davetleri',
      'Plan tempo göstergeleri ve risk analizi',
      'Sayfa bazlı takip ve hedef kapsamı',
      'İlerleme raporu (yazdırılabilir)',
    ],
    cta: 'register',
    highlighted: true,
  },
  {
    key: 'institution',
    audience: 'Kurs, dershane ve eğitim kurumları',
    limit: 'Sınırsız öğrenci',
    features: [
      'Koç planındaki her şey',
      'Çoklu öğretmen hesabı ve çalışma alanı geçişi',
      'Kurum geneli dönem yönetimi',
      'Kitap havuzu yedeği (CSV / JSON)',
      'Öncelikli destek',
    ],
    cta: 'contact',
  },
]

export function PricingSection() {
  const [period, setPeriod] = useState<BillingPeriod>('yearly')

  return (
    <section
      id="fiyatlar"
      className="scroll-mt-16 border-y bg-muted/30 px-6 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Fiyatlandırma"
          title="Öğrenci sayınıza göre"
          description={`${TRIAL_DAYS} gün boyunca ürünün tamamını ücretsiz deneyin. Sonrasında öğrenci sayınıza uyan planı seçersiniz.`}
        />

        <div className="mt-10 flex justify-center">
          <div
            className="inline-flex items-center rounded-md border bg-card p-0.5"
            role="group"
            aria-label="Ödeme dönemi"
          >
            <Button
              type="button"
              size="sm"
              variant={period === 'monthly' ? 'default' : 'ghost'}
              onClick={() => setPeriod('monthly')}
            >
              Aylık
            </Button>
            <Button
              type="button"
              size="sm"
              variant={period === 'yearly' ? 'default' : 'ghost'}
              onClick={() => setPeriod('yearly')}
            >
              Yıllık
              {/* Seçiliyken arka plan tonu YOK: mor düğmenin üstüne %15
                  beyaz katman koymak zemini açıyor ve beyaz metinle
                  kontrast 4.14'e düşüyordu (AA için 4.5 gerekli). Metni
                  doğrudan mor üzerine bırakmak hem daha okunaklı hem de
                  seçili durumu zaten düğmenin kendisi anlatıyor. */}
              <span
                className={cn(
                  'ml-1.5 rounded-sm text-[11px] font-medium',
                  period === 'yearly'
                    ? 'text-primary-foreground'
                    : 'bg-success-subtle px-1.5 py-0.5 text-success-foreground'
                )}
              >
                %{yearlyDiscountPercent('coach')} indirim
              </span>
            </Button>
          </div>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            // Kurum planının fiyatı yok. Anahtarın kendisini daraltıyoruz
            // ki fiyat fonksiyonlarına 'institution' geçme ihtimali
            // derleme zamanında imkânsız olsun.
            const payableKey = plan.key === 'institution' ? null : plan.key

            return (
              <div
                key={plan.key}
                className={cn(
                  'flex flex-col rounded-lg border bg-card p-6 transition-colors',
                  plan.highlighted
                    ? 'border-primary shadow-lg shadow-primary/10 md:-my-2 md:py-8'
                    : 'hover:border-primary/40'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">{PLAN_DEFS[plan.key].name}</h3>
                  {plan.highlighted && (
                    <span className="rounded-sm bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      En çok tercih edilen
                    </span>
                  )}
                </div>

                <p className="mt-1.5 text-sm text-muted-foreground">{plan.audience}</p>

                {payableKey ? (
                  <div className="mt-5">
                    <p className="text-3xl font-semibold tracking-tight tabular-nums">
                      {formatKurus(
                        period === 'yearly'
                          ? yearlyPerMonthKurus(payableKey)
                          : PLAN_PRICING[payableKey].monthlyKurus
                      )}
                      <span className="text-sm font-normal text-muted-foreground">
                        {' '}
                        / ay
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {period === 'yearly'
                        ? `Yılda tek çekim ${formatKurus(PLAN_PRICING[payableKey].yearlyKurus)}`
                        : 'Her ay yenilenir'}
                      {' · KDV dahil'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{plan.limit}</p>
                  </div>
                ) : (
                  <div className="mt-5">
                    <p className="text-3xl font-semibold tracking-tight">{plan.limit}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Fiyat için görüşelim
                    </p>
                  </div>
                )}

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
                      className={buttonVariants({
                        variant: plan.highlighted ? 'default' : 'outline',
                        className: 'w-full',
                      })}
                    >
                      {TRIAL_DAYS} Gün Ücretsiz Dene
                      <ArrowRight />
                    </Link>
                  ) : (
                    <a
                      href={contactMailto(
                        `${BRAND.name} — ${PLAN_DEFS[plan.key].name} planı hakkında`
                      )}
                      className={buttonVariants({ variant: 'outline', className: 'w-full' })}
                    >
                      İletişime geç
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <GuaranteeStrip className="mt-8" />

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Öğrenci ve veli hesapları tüm planlarda ücretsizdir — yalnızca öğretmen
          tarafı ücretlendirilir.{' '}
          <Link href="/iade" className="underline underline-offset-4 hover:text-foreground">
            İade koşulları
          </Link>
        </p>
      </div>
    </section>
  )
}
