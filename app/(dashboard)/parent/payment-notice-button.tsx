'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createPaymentNoticeAction } from './actions'

/**
 * "Ödeme yaptım" bildirimi (R7-04 Rev.3 §8).
 *
 * BU BİR TALEPTİR, KAYIT DEĞİL. Veli bir tuşa bastığında hesap
 * kapanmıyor; öğretmenin listesine "veli ödediğini söylüyor" satırı
 * düşüyor. Metin de bunu söylüyor — "Ödendi" yazan bir tuş, velinin
 * işin bittiğini sanmasına yol açardı.
 *
 * NOT ALANI İSTEĞE BAĞLI VE SERBEST: "havale yaptım, dekont
 * WhatsApp'ta" gibi bir cümle, öğretmenin ödemeyi eşleştirmesini
 * kolaylaştıran tek şey olabilir. Tutar SORULMUYOR: defterin sahibi
 * öğretmen ve velinin yazdığı bir rakam, doğrulanmadan kayda
 * geçebilecekmiş izlenimi verirdi.
 */
export function PaymentNoticeButton({
  studentId,
  monthStart,
  monthLabel,
  pending,
}: {
  studentId: string
  /** 'YYYY-MM-01'. */
  monthStart: string
  monthLabel: string
  /** Bu ay için zaten bekleyen bir bildirim var mı? */
  pending: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  // BEKLEYEN BİLDİRİM VARKEN TUŞ GÖSTERİLMİYOR. Veritabanı ikinciyi
  // zaten reddediyor; tuşu açık bırakmak, reddedilecek bir işlemi
  // davet etmek olurdu.
  if (pending) {
    return (
      <p className="text-xs text-muted-foreground">
        Ödeme bildiriminiz öğretmene iletildi, onay bekleniyor.
      </p>
    )
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Ödeme yaptım
      </Button>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="paymentNote" className="text-xs">
        Eklemek istediğiniz not{' '}
        <span className="text-muted-foreground">(isteğe bağlı)</span>
      </Label>
      <Textarea
        id="paymentNote"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Örn. 12 Eylül'de havale ettim, dekontu ilettim."
      />
      <p className="text-xs text-muted-foreground">
        {monthLabel} ödemesi için öğretmene bildirim gönderilecek. Kayıt,
        öğretmen onayladıktan sonra güncellenir.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await createPaymentNoticeAction(studentId, monthStart, note)
              if (result?.error) {
                toast.error(result.error)
                return
              }
              toast.success('Bildiriminiz öğretmene iletildi.')
              setOpen(false)
              setNote('')
              router.refresh()
            })
          }
        >
          Gönder
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Vazgeç
        </Button>
      </div>
    </div>
  )
}
