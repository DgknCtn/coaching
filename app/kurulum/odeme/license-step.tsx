'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'
import { LicenseConfigurator } from '@/components/billing/license-configurator'
import { purchaseLicenseAction } from '@/app/(dashboard)/teacher/ayarlar/abonelik/actions'
import { TRIAL_DAYS } from '@/lib/plans'

// KAYIT SONRASI LİSANS ADIMI.
//
// ============================================================
// NEDEN ZORUNLU DEĞİL
//
// Bu ekran 057'de "deneme sonunda otomatik çekebilmek için kartı şimdi
// al" diye kurulmuştu. Otomatik tahsilat kaldırıldı (058), dolayısıyla
// kartı önden almanın bir sebebi kalmadı.
//
// Adım tamamen silinmedi çünkü hâlâ bir işe yarıyor: kullanıcı ürünün
// ne kadara mal olacağını ilk dakikada görüyor ve hazırsa hemen
// alabiliyor. Ama ZORUNLU DEĞİL — 7 günlük ücretsiz deneme dururken
// satın almaya zorlamak, ürünü hiç görmemiş kullanıcıyı kapıda
// kaybetmek olurdu.
// ============================================================

export function LicenseStep() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="text-center">
        <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Check className="size-3.5 text-success-foreground" />
          Hesabınız oluşturuldu
        </p>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
          Planınızı seçin
        </h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          Kaç öğrenci takip edeceğinizi ve ne kadar süre kullanacağınızı seçin.
          İkisi de arttıkça öğrenci başına maliyet düşer.
        </p>
      </div>

      <div className="mt-8">
        <LicenseConfigurator onPurchase={purchaseLicenseAction} />
      </div>

      {/* İKİNCİL AMA GÖRÜNÜR. 7 günlük ücretsiz deneme dururken satın
          almaya zorlamak, ürünü hiç görmemiş kullanıcıyı kaybetmek. */}
      <p className="mt-6 text-center text-sm">
        <Link
          href="/teacher"
          className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Önce {TRIAL_DAYS} gün ücretsiz deneyeceğim
        </Link>
      </p>
    </div>
  )
}
