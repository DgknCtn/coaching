'use client'

import { LicenseConfigurator } from '@/components/billing/license-configurator'
import { purchaseLicenseAction } from './actions'

// Sunucu aksiyonunu yapılandırıcıya bağlayan ince katman.
//
// Yapılandırıcı `components/billing/` altında ve hangi aksiyonun
// çağrılacağını bilmiyor — aynı bileşen hem lisans sayfasında hem
// kurulum adımında kullanılıyor. Bağlama noktası burası.

export function LicensePurchase({ currentStudents }: { currentStudents: number }) {
  return (
    <LicenseConfigurator
      onPurchase={purchaseLicenseAction}
      currentStudents={currentStudents}
    />
  )
}
