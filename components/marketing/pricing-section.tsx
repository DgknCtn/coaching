import Link from 'next/link'
import { Check, ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { BRAND, contactMailto } from '@/lib/brand'
import { PLANS as PLAN_DEFS, TRIAL_DAYS } from '@/lib/plans'
import {
  PLAN_PRICING,
  ENABLED_INSTALLMENTS,
  formatKurus,
  yearlyDiscountPercent,
  yearlyPerMonthKurus,
} from '@/lib/billing/pricing'
import { cn } from '@/lib/utils'
import { SectionHeading } from './section-heading'

// Fiyatlandırma (SaaS vitrini).
//
// ============================================================
// FİYAT ARTIK GİZLİ DEĞİL (056)
//
// Bu bölüm daha önce bilinçli olarak rakamsızdı: fiyat netleşmemişti ve
// yanlış bir rakamı vitrine koyup sonra yükseltmek ilk müşterilerde güven
// kaybı yaratırdı. Ödeme entegrasyonuyla birlikte fiyat belirlendi, satın
// alma self-servis çalışıyor; rakamı saklamak artık şeffaflık değil
// sürtünme olurdu — "fiyat için görüşelim" satın almaya hazır kullanıcıyı
// e-posta kuyruğuna sokar.
//
// RAKAMLAR KODDAN OKUNUYOR: lib/billing/pricing.ts. Elle yazılsalardı
// ödeme ekranıyla vitrin ayrışabilirdi ve müşteri, gördüğünden başka bir
// tutarla karşılaşırdı.
//
// ÖĞRENCİ SINIRLARI GERÇEKTEN UYGULANIYOR (052): workspaces.student_limit
// ve students üzerindeki tetikleyici.
//
// YAYINA ÇIKMADAN ÖNCE: buradaki rakamlar lib/billing/pricing.ts'te
// tanımlı ve HENÜZ ONAYLANMADI. Yayınlanmış bir fiyatı değiştirmek
// mevcut abonelerin yenileme bedelini de değiştirir.
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

const maxInstallment = Math.max(...ENABLED_INSTALLMENTS)

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
          description={`${TRIAL_DAYS} gün boyunca ürünün tamamını ücretsiz deneyin — kredi kartı istemiyoruz. Sonrasında öğrenci sayınıza uyan planı seçersiniz.`}
        />

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            // Kurum planının fiyatı yok. Daraltmayı `pricing` üzerinden
            // yapmak TypeScript'e yetmiyor; anahtarın kendisini daraltıyoruz
            // ki fiyat fonksiyonlarına 'institution' geçme ihtimali
            // derleme zamanında imkânsız olsun.
            const payableKey = plan.key === 'institution' ? null : plan.key
            const pricing = payableKey ? PLAN_PRICING[payableKey] : null

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

                {payableKey && pricing ? (
                  <div className="mt-5">
                    <p className="text-2xl font-semibold tracking-tight tabular-nums">
                      {formatKurus(pricing.monthlyKurus)}
                      <span className="text-sm font-normal text-muted-foreground">
                        {' '}
                        / ay
                      </span>
                    </p>
                    {/* Yıllık seçenek burada gizlenmiyor: indirim, satın alma
                        kararının bir parçası ve ödeme ekranında sürpriz
                        olarak çıkmamalı. */}
                    <p className="mt-1 text-sm text-muted-foreground">
                      Yıllık ödemede ayda{' '}
                      <strong className="font-medium text-foreground tabular-nums">
                        {formatKurus(yearlyPerMonthKurus(payableKey))}
                      </strong>{' '}
                      — %{yearlyDiscountPercent(payableKey)} indirim
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      KDV dahil · {plan.limit}
                    </p>
                  </div>
                ) : (
                  <div className="mt-5">
                    <p className="text-2xl font-semibold tracking-tight">{plan.limit}</p>
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

        <div className="mt-8 space-y-2 text-center text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">
              Yıllık pakette {maxInstallment} taksite kadar
            </strong>{' '}
            ödeme yapabilirsiniz. Aylık abonelikte taksit yapılamaz; tutar her ay tek
            seferde tahsil edilir.
          </p>
          <p>
            Tüm planlarda öğrenci ve veli hesapları ücretsizdir — yalnızca öğretmen
            tarafı ücretlendirilir.
          </p>
          <p>
            Dilediğiniz zaman tek adımda iptal edebilirsiniz; ilk ödemenizden itibaren{' '}
            <Link href="/iade" className="underline underline-offset-4 hover:text-foreground">
              14 gün koşulsuz iade
            </Link>{' '}
            hakkınız var.
          </p>
        </div>
      </div>
    </section>
  )
}
