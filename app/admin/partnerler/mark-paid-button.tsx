'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { markCommissionsPaidAction } from './actions'

// HAKEDİŞİ ÖDENDİ İŞARETLE.
//
// İKİ ADIMLI: para transferini kaydeden, geri alınamaz bir işlem.
// Yanlışlıkla tıklanan tek bir düğme, ödenmemiş bir hakedişi ödenmiş
// gösterir ve partner parasını hiç alamaz — üstelik kayıt onu haklı
// çıkarmaz. Onay adımı tutarı da tekrar gösteriyor.

export function MarkPaidButton({
  partnerId,
  partnerName,
  amount,
}: {
  partnerId: string
  partnerName: string
  amount: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  function mark() {
    startTransition(async () => {
      const res = await markCommissionsPaidAction(partnerId)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${partnerName} için ${amount} ödendi olarak işaretlendi.`)
      setConfirming(false)
    })
  }

  if (!confirming) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
        Ödendi işaretle
      </Button>
    )
  }

  return (
    <div className="flex justify-end gap-1.5">
      <Button type="button" size="sm" disabled={pending} onClick={mark}>
        {pending ? '…' : `${amount} ödendi`}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Vazgeç
      </Button>
    </div>
  )
}
