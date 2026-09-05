import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { BRAND } from '@/lib/brand'
import { TRIAL_CTA_LABEL } from '@/lib/plans'
import { GuaranteeStrip } from './guarantee-strip'

// SAYFANIN SON CTA'SI.
//
// ============================================================
// NEDEN "DEMOYU DENEYİN" DEĞİL
//
// Ürün yeni; gösterilecek referans, logo ya da kullanıcı sayısı yok ve
// uydurulmayacak da (bkz. stats-bar.tsx, commitments-section.tsx).
// Boşluğu kapatan şey başkasının kanıtı değil, okuyucunun KENDİ
// kanıtı: kendi öğrencisini ekleyip ilk ödevini verdiğinde ürünün işe
// yarayıp yaramadığını kimseye sormasına gerek kalmıyor.
//
// ÜÇ ADIM KAYITTAN ÖNCE GÖSTERİLİYOR: "kaydol" demek, karşılığında ne
// olacağını bilmeyen biri için bir risk. Adımları önceden göstermek o
// riski kaldırıyor — hepsi tek oturumda bitecek kadar kısa.
//
// SÖZCÜKLER onboarding-checklist.tsx'teki adım başlıklarıyla BİREBİR
// AYNI olmalı. Burada "ödev oluşturun", orada "ödev verin" yazarsa
// kullanıcı vaat edilen akışta olduğundan emin olamaz.
// ============================================================

const STEPS = ['Öğrencinizi ekleyin', 'İlk ödevinizi verin', 'Takip etmeye başlayın']

export function ClosingCta() {
  return (
    <section className="px-6 pb-24 md:pb-28">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-xl border bg-card px-6 py-16 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_100%_at_50%_0%,var(--primary)_0%,transparent_70%)] opacity-[0.07]"
          />
          <h2 className="relative text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Kendi öğrencilerinizde deneyin
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            Öğrenci takibinizi bugün {BRAND.name}&apos;e taşıyın.
          </p>

          {/* Sıralı liste: adımlar gerçekten birbirine dayanıyor (öğrenci
              olmadan ödev verilemez), numaralandırma süs değil bilgi. */}
          <ol className="relative mx-auto mt-8 flex max-w-2xl flex-col items-center justify-center gap-3 sm:flex-row sm:gap-2">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-2 sm:gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold tabular-nums text-primary">
                  {i + 1}
                </span>
                <span className="text-sm font-medium">{step}</span>
                {/* Ok yalnız aralarda; sondaki ok "devamı var" der. */}
                {i < STEPS.length - 1 && (
                  <ArrowRight
                    aria-hidden
                    className="hidden size-4 shrink-0 text-muted-foreground/50 sm:block"
                  />
                )}
              </li>
            ))}
          </ol>

          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className={buttonVariants({ size: 'lg' })}>
              {TRIAL_CTA_LABEL}
              <ArrowRight />
            </Link>
            <Link
              href="/demo"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              Demoyu Gör
            </Link>
          </div>

          {/* Sayfadaki son CTA: kart itirazı burada da karşılanmalı. */}
          <GuaranteeStrip className="relative mt-6" />
        </div>
      </div>
    </section>
  )
}
