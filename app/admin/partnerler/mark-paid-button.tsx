'use client'

import { ActionDialog } from '@/components/admin/action-dialog'
import { markCommissionsPaidAction } from './actions'

// HAKEDİŞİ ÖDENDİ İŞARETLE.
//
// ONAYLI VE GEREKÇELİ (129): para transferini kaydeden, geri alınamaz
// bir işlem. Yanlışlıkla işaretlenen hakediş, partnerin parasını hiç
// alamaması demek. Diyalog tutarı yeniden gösterir; gerekçe (ör. havale
// referansı) yönetim kaydına değişmez olarak yazılır.

export function MarkPaidButton({
  partnerId,
  partnerName,
  amount,
}: {
  partnerId: string
  partnerName: string
  amount: string
}) {
  return (
    <ActionDialog
      triggerLabel="Ödendi işaretle"
      title="Hakedişi ödendi işaretle"
      description="Yalnız ödeme partnere gerçekten gönderildiyse. Gerekçeye havale/EFT referansını yazın."
      submitLabel={`${amount} ödendi`}
      successMessage={`${partnerName} için ${amount} ödendi olarak işaretlendi.`}
      preview={
        <p>
          {partnerName} · {amount}: <span className="text-muted-foreground">ödenmedi</span> →{' '}
          <span className="font-medium">ödendi</span>
        </p>
      }
      onSubmit={(reason) => markCommissionsPaidAction(partnerId, reason)}
    />
  )
}
