'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { startCheckoutAction } from './actions'
import {
  PLAN_PRICING,
  formatKurus,
  yearlyDiscountPercent,
  yearlyPerMonthKurus,
  type PayablePlanId,
  type BillingPeriod,
} from '@/lib/billing/pricing'
import { PLANS } from '@/lib/plans'

// PLAN SEÇİMİ VE ÖDEMEYE GEÇİŞ.
//
// TAKSİT YOK (057): her iki dönem de tek çekim. Yıllıkta indirim var.

const PAYABLE: PayablePlanId[] = ['starter', 'coach']

export function PlanPicker({ currentPlan }: { currentPlan: string }) {
  const [period, setPeriod] = useState<BillingPeriod>('yearly')
  const [pendingPlan, setPendingPlan] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function buy(plan: PayablePlanId) {
    setPendingPlan(plan)
    startTransition(async () => {
      const res = await startCheckoutAction(plan, period)
      if (res.error) {
        toast.error(res.error)
        setPendingPlan(null)
        return
      }
      // Sağlayıcının barındırılan sayfasına gidiyoruz: kart bilgisi
      // bizim sayfamıza hiç girilmiyor.
      if (res.paymentPageUrl) window.location.href = res.paymentPageUrl
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Ödeme dönemi">
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
          </Button>
        </div>

        {period === 'yearly' && (
          <Badge variant="success">%{yearlyDiscountPercent('starter')} indirim</Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PAYABLE.map(plan => {
          const isCurrent = currentPlan === plan
          const priceKurus =
            period === 'yearly' ? PLAN_PRICING[plan].yearlyKurus : PLAN_PRICING[plan].monthlyKurus

          return (
            <Card key={plan}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{PLANS[plan].name}</CardTitle>
                  {isCurrent && <Badge variant="info">Mevcut planınız</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatKurus(priceKurus)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {period === 'yearly'
                      ? `Yılda bir — ayda ${formatKurus(yearlyPerMonthKurus(plan))}`
                      : 'Ayda bir'}
                    {' · KDV dahil'}
                  </p>
                </div>

                <p className="text-sm text-muted-foreground">{PLANS[plan].description}</p>
                <p className="text-sm">
                  <strong className="font-medium">
                    {PLANS[plan].studentLimit} aktif öğrenciye kadar
                  </strong>
                </p>

                <Button
                  type="button"
                  className="w-full"
                  disabled={pendingPlan !== null}
                  onClick={() => buy(plan)}
                >
                  {pendingPlan === plan ? 'Ödeme sayfası açılıyor…' : 'Ödemeye geç'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Ödeme, iyzico&apos;nun güvenli sayfasında alınır; kart bilgileriniz bize hiçbir
        aşamada iletilmez ve sistemimizde saklanmaz.
      </p>
    </div>
  )
}
