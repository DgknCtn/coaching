'use client'

import { ActionDialog } from '@/components/admin/action-dialog'
import { updatePartnerAction } from './actions'

/**
 * Partneri askıya alır / geri açar.
 *
 * ASKI, SİLME DEĞİL: silmek, geçmiş hakedişleri ve hangi çalışma
 * alanını kimin getirdiğini de götürürdü — muhasebe kaydı silinmez.
 * Askıya alınan partner ne YENİ atıf alır ne yeni hakediş üretir
 * (settle_billing_order ve resolve_partner_code yalnız aktif partneri
 * arıyor), birikmiş ödenmemiş hakedişi ise yerinde durur.
 *
 * ONAYLI VE GEREKÇELİ (129): partnerin kodu dışarıda dolaşıyor.
 * Yanlışlıkla askıya alınan bir partner, o sırada onun bağlantısından
 * gelen herkesi sessizce kaybeder. Askıya almada partner adı yazılarak
 * onaylanır; her iki yön de yönetim kaydına girer.
 */
export function PartnerStatusButton({
  partnerId,
  partnerName,
  status,
}: {
  partnerId: string
  partnerName: string
  status: string
}) {
  const suspended = status !== 'active'

  if (suspended) {
    return (
      <ActionDialog
        triggerLabel="Aktif et"
        title="Partneri yeniden aktif et"
        description="Kodu yeniden atıf ve hakediş üretmeye başlar."
        submitLabel="Aktif et"
        successMessage={`${partnerName} yeniden aktif.`}
        preview={
          <p>
            Durum: <span className="text-muted-foreground">askıda</span> →{' '}
            <span className="font-medium">aktif</span>
          </p>
        }
        onSubmit={(reason) => updatePartnerAction({ partnerId, status: 'active', reason })}
      />
    )
  }

  return (
    <ActionDialog
      triggerLabel="Askıya al"
      title="Partneri askıya al"
      description="Kodu artık yeni atıf almaz ve yeni hakediş üretmez; birikmiş ödenmemiş hakediş yerinde kalır."
      submitLabel="Askıya al"
      successMessage={`${partnerName} askıya alındı; kodu artık yeni atıf almaz.`}
      destructive
      confirmPhrase={partnerName}
      preview={
        <p>
          Durum: <span className="text-muted-foreground">aktif</span> →{' '}
          <span className="font-medium">askıda</span>
        </p>
      }
      onSubmit={(reason) => updatePartnerAction({ partnerId, status: 'suspended', reason })}
    />
  )
}
