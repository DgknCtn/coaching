'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { updateEmailNotificationsAction } from './actions'

// HİZMET E-POSTALARI TERCİHİ (131). Değişiklik anında kaydedilir; hata
// olursa kutu eski hâline döner — ekranda görünen, kayıtlı olanla aynı.

export function NotificationToggle({ enabled }: { enabled: boolean }) {
  const [checked, setChecked] = useState(enabled)
  const [pending, startTransition] = useTransition()

  function change(next: boolean) {
    setChecked(next)
    startTransition(async () => {
      const res = await updateEmailNotificationsAction(next)
      if (res.error) {
        setChecked(!next)
        toast.error(res.error)
        return
      }
      toast.success(next ? 'Hatırlatma e-postaları açık.' : 'Hatırlatma e-postaları kapatıldı.')
    })
  }

  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-primary"
        checked={checked}
        disabled={pending}
        onChange={(e) => change(e.target.checked)}
      />
      <span>
        <span className="font-medium">Deneme ve lisans hatırlatmaları</span>
        <span className="mt-0.5 block text-muted-foreground">
          Süren bitmeden önce e-posta ile haber verilir. Ödeme makbuzları ve şifre sıfırlama
          e-postaları bu ayardan etkilenmez.
        </span>
      </span>
    </label>
  )
}
