'use client'

import { ActionDialog } from '@/components/admin/action-dialog'
import { resolveOrderAction } from '@/app/admin/admin-actions'

// BEKLEYEN SİPARİŞİ KAPATMA (128). Yalnız bir saatten eski siparişlerde
// gösterilir; veritabanı da aynı kuralı uygular (süren ödemeyle yarış yok).

export function ResolveOrder({
  orderId,
  workspaceName,
  amount,
}: {
  orderId: string
  workspaceName: string
  amount: string
}) {
  return (
    <div className="flex gap-1.5">
      <ActionDialog
        triggerLabel="Ödendi"
        title="Siparişi ödendi say"
        description="Yalnız tahsilat ödeme sağlayıcısında doğrulandıysa. Lisans açılır ve varsa partner hakedişi oluşur."
        submitLabel="Ödendi say"
        successMessage="Sipariş ödendi sayıldı; lisans açıldı."
        confirmPhrase={workspaceName}
        preview={
          <p>
            {workspaceName} · {amount}: <span className="text-muted-foreground">bekliyor</span> →{' '}
            <span className="font-medium">ödendi</span>
          </p>
        }
        onSubmit={(reason) => resolveOrderAction({ orderId, outcome: 'paid', reason })}
      />
      <ActionDialog
        triggerLabel="Başarısız"
        title="Siparişi başarısız say"
        description="Sipariş kapanır; lisans ya da hakediş oluşmaz. Müşteri yeniden ödeme başlatabilir."
        submitLabel="Başarısız say"
        successMessage="Sipariş başarısız sayıldı."
        preview={
          <p>
            {workspaceName} · {amount}: <span className="text-muted-foreground">bekliyor</span> →{' '}
            <span className="font-medium">başarısız</span>
          </p>
        }
        onSubmit={(reason) => resolveOrderAction({ orderId, outcome: 'failed', reason })}
      />
    </div>
  )
}
