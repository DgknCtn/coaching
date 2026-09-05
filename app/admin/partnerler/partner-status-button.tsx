'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
 * İKİ ADIMLI: partnerin kodu dışarıda dolaşıyor. Yanlışlıkla askıya
 * alınan bir partner, o sırada onun bağlantısından gelen herkesi
 * sessizce kaybeder — geri alındığında bile o kayıtlar geri gelmez.
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
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  const suspended = status !== 'active'
  const next = suspended ? 'active' : 'suspended'

  function apply() {
    startTransition(async () => {
      const res = await updatePartnerAction({ partnerId, status: next })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(
        suspended
          ? `${partnerName} yeniden aktif.`
          : `${partnerName} askıya alındı; kodu artık yeni atıf almaz.`
      )
      setConfirming(false)
    })
  }

  // Geri açmak zararsız: onay adımı yalnız askıya almada.
  if (suspended) {
    return (
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={apply}>
        {pending ? '…' : 'Aktif et'}
      </Button>
    )
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setConfirming(true)}
        aria-label={`${partnerName} partnerini askıya al`}
      >
        Askıya al
      </Button>
    )
  }

  return (
    <span className="flex items-center justify-end gap-1.5">
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={apply}>
        {pending ? '…' : 'Askıya al'}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Vazgeç
      </Button>
    </span>
  )
}
