'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cancelSubscriptionAction } from './actions'

// ABONELİK İPTALİ.
//
// İPTAL ZORLAŞTIRILMAZ: tek onay, gerekçe sorusu yok, "kalmak için
// tıklayın" tuzağı yok. Mesafeli satış mevzuatı iptalin en az satın alma
// kadar kolay olmasını gerektiriyor — ve zorlaştırılmış iptal, iptal
// etmek isteyen müşteriyi elde tutmuyor, yalnız kötü bir iz bırakıyor.
//
// Onay adımı yine de var çünkü işlem faturalamayı etkiliyor; ama tek
// adım ve geri dönüşü açık.

export function CancelSubscription({ periodEnd }: { periodEnd: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  const endLabel = new Date(periodEnd).toLocaleDateString('tr-TR')

  function cancel() {
    startTransition(async () => {
      const res = await cancelSubscriptionAction()
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(
        `Aboneliğiniz iptal edildi. Erişiminiz ${endLabel} tarihine kadar sürüyor.`
      )
      setConfirming(false)
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Aboneliği iptal et</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          İptal ettiğinizde erişiminiz hemen kesilmez:{' '}
          <strong className="text-foreground">{endLabel}</strong> tarihine kadar
          kullanmaya devam edersiniz. Verileriniz silinmez.
        </p>

        {confirming ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" disabled={pending} onClick={cancel}>
              {pending ? 'İptal ediliyor…' : 'Evet, iptal et'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Vazgeç
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
            Aboneliği iptal et
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
