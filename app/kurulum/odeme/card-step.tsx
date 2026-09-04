'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, ShieldCheck, CreditCard, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { startSubscriptionAction } from './actions'
import {
  PLAN_PRICING,
  formatKurus,
  yearlyDiscountPercent,
  yearlyPerMonthKurus,
  type PayablePlanId,
  type BillingPeriod,
} from '@/lib/billing/pricing'
import { PLANS, TRIAL_DAYS } from '@/lib/plans'
import { cn } from '@/lib/utils'

// KART ADIMI — huninin en kırılgan ekranı.
//
// ============================================================
// TASARIM KARARI: İTİRAZ GİZLENMİYOR, KARŞILANIYOR
//
// Kart istemek, kayıt olan kullanıcının vazgeçtiği en olası nokta.
// Refleks, kart alanını sessizce sunmaktır; doğrusu tam tersi —
// endişeyi ADIYLA söyleyip hemen cevaplamak. Bu yüzden üç güvence
// ekranın en üstünde, formdan ÖNCE duruyor:
//
//   1. Deneme boyunca tahsilat yok
//   2. Ne zaman çekileceği (tarih değil ama süre) açıkça yazılı
//   3. Tek tıkla iptal
//
// "Sonra hatırlat" linki bilinçli olarak VAR ama görsel olarak ikincil:
// kart adımı varsayılan yol olmalı, ama kapıyı kilitlemek kaydolmuş bir
// kullanıcıyı ürünü hiç görmeden kaybetmek demek.
// ============================================================

const PAYABLE: PayablePlanId[] = ['starter', 'coach']

export function CardStep({ notice }: { notice?: string }) {
  const [plan, setPlan] = useState<PayablePlanId>('coach')
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const [pending, startTransition] = useTransition()
  const [formHtml, setFormHtml] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  // Sağlayıcının form içeriği <script> taşıyor. `dangerouslySetInnerHTML`
  // ile basılan script'ler ÇALIŞMAZ (tarayıcı güvenlik kuralı), bu yüzden
  // script etiketleri yeniden oluşturulup ekleniyor. İçerik sağlayıcının
  // kendi uçtan alınan yanıtı; kullanıcı girdisi değil.
  useEffect(() => {
    if (!formHtml || !formRef.current) return

    const container = formRef.current
    container.innerHTML = formHtml

    const scripts = Array.from(container.querySelectorAll('script'))
    for (const old of scripts) {
      const script = document.createElement('script')
      for (const attr of Array.from(old.attributes)) {
        script.setAttribute(attr.name, attr.value)
      }
      script.textContent = old.textContent
      old.parentNode?.replaceChild(script, old)
    }
  }, [formHtml])

  function start() {
    startTransition(async () => {
      const res = await startSubscriptionAction(plan, period)
      if (res.error) {
        toast.error(res.error)
        return
      }
      if (res.formContent) setFormHtml(res.formContent)
    })
  }

  const priceKurus =
    period === 'yearly' ? PLAN_PRICING[plan].yearlyKurus : PLAN_PRICING[plan].monthlyKurus

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="text-center">
        <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Check className="size-3.5 text-success-foreground" />
          Hesabınız oluşturuldu
        </p>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
          {TRIAL_DAYS} günlük denemenizi başlatın
        </h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          Kartınızı şimdi kaydedin, deneme bitiminde kesinti yaşamadan devam edin.
        </p>
      </div>

      {notice && (
        <div
          className="mt-6 rounded-md border border-destructive-border bg-destructive-subtle px-4 py-3 text-sm text-destructive-foreground"
          role="status"
        >
          {notice}
        </div>
      )}

      {/* GÜVENCELER FORMDAN ÖNCE. Kullanıcı "kart" kelimesini görür
          görmez aklına gelen üç soruyu, sormasına fırsat kalmadan
          cevaplıyoruz. */}
      <ul className="mt-8 space-y-3 rounded-lg border bg-muted/30 p-5">
        <li className="flex gap-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-foreground" />
          <span>
            <strong className="font-medium text-foreground">
              Deneme boyunca kartınızdan tahsilat yapılmaz.
            </strong>{' '}
            Kartın geçerliliği 1 ₺ provizyon alınıp anında iade edilerek doğrulanır.
          </span>
        </li>
        <li className="flex gap-3 text-sm">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            İlk tahsilat {TRIAL_DAYS} gün sonra yapılır ve öncesinde e-posta ile
            hatırlatırız.
          </span>
        </li>
        <li className="flex gap-3 text-sm">
          <CreditCard className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            Dilediğiniz an tek tıkla iptal edersiniz — kart bilgileriniz bize hiçbir
            aşamada iletilmez, ödeme kuruluşunda saklanır.
          </span>
        </li>
      </ul>

      {formHtml ? (
        // Sağlayıcının barındırılan formu. Kart alanları bizim DOM'umuzda
        // DEĞİL, sağlayıcının çerçevesinde; PCI kapsamına girmiyoruz.
        <div ref={formRef} className="mt-8" />
      ) : (
        <>
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-center">
              <div
                className="inline-flex rounded-md border p-0.5"
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
                  Yıllık · %{yearlyDiscountPercent(plan)} indirim
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {PAYABLE.map(p => {
                const selected = plan === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    aria-pressed={selected}
                    className={cn(
                      'rounded-lg border p-4 text-left transition-colors',
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-primary/40'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{PLANS[p].name}</span>
                      {selected && <Check className="size-4 text-primary" />}
                    </div>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {formatKurus(
                        period === 'yearly'
                          ? yearlyPerMonthKurus(p)
                          : PLAN_PRICING[p].monthlyKurus
                      )}
                      <span className="text-xs font-normal text-muted-foreground">
                        {' '}
                        / ay
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {PLANS[p].studentLimit} aktif öğrenciye kadar
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <Button
            type="button"
            size="lg"
            className="mt-6 w-full"
            disabled={pending}
            onClick={start}
          >
            {pending ? 'Form açılıyor…' : `${TRIAL_DAYS} günlük denemeyi başlat`}
          </Button>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            Deneme sonunda {formatKurus(priceKurus)} (KDV dahil){' '}
            {period === 'yearly' ? 'yıllık' : 'aylık'} olarak tahsil edilir. Devam
            ederek{' '}
            <Link href="/mesafeli-satis" className="underline underline-offset-2">
              mesafeli satış sözleşmesini
            </Link>{' '}
            ve{' '}
            <Link href="/on-bilgilendirme" className="underline underline-offset-2">
              ön bilgilendirme formunu
            </Link>{' '}
            kabul edersiniz.
          </p>

          {/* İKİNCİL AMA VAR. Kapıyı kilitlemek, kaydolmuş bir kullanıcıyı
              ürünü hiç görmeden kaybetmek demek. */}
          <p className="mt-6 text-center text-sm">
            <Link
              href="/teacher?kart=sonra"
              className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Şimdilik atla, sonra hatırlat
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
