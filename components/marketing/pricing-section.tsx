'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, ArrowRight, Users, CalendarRange } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BRAND, contactMailto } from '@/lib/brand'
import { PLAN_INCLUDED, TRIAL_DAYS } from '@/lib/plans'
import {
  quote,
  isSelfService,
  formatKurus,
  formatKurusShort,
  MONTH_OPTIONS,
  MAX_SELF_SERVICE_STUDENTS,
} from '@/lib/billing/pricing'
import { SectionHeading } from './section-heading'
import { GuaranteeStrip } from './guarantee-strip'

// FİYATLANDIRMA — lisans hesaplayıcısı (058).
//
// ============================================================
// NEDEN KADEME KARTLARI DEĞİL HESAPLAYICI
//
// Önceki bölüm üç sabit kademe gösteriyordu (Başlangıç/Koç/Kurum).
// Yeni modelde fiyat öğrenci sayısı ve süreye göre sürekli değişiyor;
// üç kart bunu temsil edemez ve "acaba benim durumumda ne tutar?"
// sorusunu cevapsız bırakırdı.
//
// Hesaplayıcı bu soruyu ziyaretçi daha kaydolmadan cevaplıyor. Satın
// alma kararının önündeki en büyük belirsizlik fiyattır; onu vitrinde
// çözmek, kayıt sonrası kaybı azaltmanın en doğrudan yolu.
//
// Rakamlar lib/billing/pricing.ts'ten; ödeme ekranıyla aynı fonksiyon.
// Vitrinde başka, kasada başka tutar göstermek güveni bir kerede bitirir.
// ============================================================

export function PricingSection() {
  const [studentsInput, setStudentsInput] = useState('10')
  const [months, setMonths] = useState(12)

  const studentCount = Number.parseInt(studentsInput, 10)
  const valid = Number.isInteger(studentCount) && studentCount >= 1
  const selfService = valid && isSelfService(studentCount)

  const q = useMemo(
    () => (valid && selfService ? quote(studentCount, months) : null),
    [valid, selfService, studentCount, months]
  )

  return (
    <section
      id="fiyatlar"
      className="scroll-mt-16 border-y bg-muted/30 px-6 py-20 md:py-28"
    >
      <div className="mx-auto max-w-5xl">
        <SectionHeading
          eyebrow="Fiyatlandırma"
          title="Yalnız ihtiyacınız kadar ödeyin"
          description={`Öğrenci sayınızı ve kullanım sürenizi siz belirleyin. İkisi de arttıkça öğrenci başına maliyet düşer. Önce ${TRIAL_DAYS} gün ücretsiz deneyin.`}
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          {/* HESAPLAYICI */}
          <div className="rounded-lg border bg-card p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pricing-students" className="flex items-center gap-1.5">
                  <Users className="size-3.5 text-muted-foreground" />
                  Öğrenci sayısı
                </Label>
                <Input
                  id="pricing-students"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_SELF_SERVICE_STUDENTS}
                  value={studentsInput}
                  onChange={(e) => setStudentsInput(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pricing-months" className="flex items-center gap-1.5">
                  <CalendarRange className="size-3.5 text-muted-foreground" />
                  Kullanım süresi
                </Label>
                <select
                  id="pricing-months"
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} Ay
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!valid ? (
              <p className="mt-6 text-sm text-muted-foreground">
                Geçerli bir öğrenci sayısı girin.
              </p>
            ) : !selfService ? (
              <div className="mt-6 rounded-md border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium">
                  {MAX_SELF_SERVICE_STUDENTS} üzeri öğrenci için özel fiyatlandırma
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Bu ölçekte kurumsal koşullar ve sözleşme gerekiyor. Size uygun fiyatı
                  birlikte belirleyelim.
                </p>
                <a
                  href={contactMailto(`${BRAND.name} — kurumsal fiyat talebi`)}
                  className="mt-3 inline-block text-sm font-medium text-primary underline underline-offset-4"
                >
                  İletişime geç
                </a>
              </div>
            ) : (
              q && (
                <div className="mt-6 border-t pt-5">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-3xl font-semibold tracking-tight tabular-nums">
                        {formatKurus(q.grossKurus)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        KDV dahil · tek çekim
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium tabular-nums">
                        {formatKurus(q.perStudentPerMonthKurus)}
                      </p>
                      <p className="text-xs text-muted-foreground">öğrenci / ay</p>
                    </div>
                  </div>

                  {q.totalDiscountPercent > 0 && (
                    <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded-sm bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-foreground">
                        %{q.totalDiscountPercent} indirim
                      </span>
                      <span className="text-muted-foreground">
                        Liste fiyatı{' '}
                        <span className="line-through tabular-nums">
                          {formatKurusShort(q.listGrossKurus)}
                        </span>
                      </span>
                    </p>
                  )}

                  <Link
                    href="/register"
                    className={buttonVariants({ size: 'lg', className: 'mt-6 w-full' })}
                  >
                    {TRIAL_DAYS} Gün Ücretsiz Dene
                    <ArrowRight />
                  </Link>
                </div>
              )
            )}
          </div>

          {/* KAPSAM — her lisansta ne var.
              Kademe olmadığı için "hangi özellik hangi pakette" sorusu da
              yok: HER ŞEY her lisansta. Bunu açıkça yazmak, kademeli
              rakiplere karşı en güçlü satış argümanı. */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="text-base font-semibold">Her lisansta bunların hepsi var</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Özellik kısıtlaması yok. Yalnız öğrenci sayısı ve süre değişir.
            </p>
            <ul className="mt-5 space-y-2.5">
              {PLAN_INCLUDED.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-success-foreground" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <GuaranteeStrip className="mt-8" />

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Öğrenci ve veli hesapları ücretsizdir — yalnızca öğretmen tarafı
          ücretlendirilir.{' '}
          <Link href="/iade" className="underline underline-offset-4 hover:text-foreground">
            İade koşulları
          </Link>
        </p>
      </div>
    </section>
  )
}
