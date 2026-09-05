'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updatePartnerAction } from './actions'

/**
 * Komisyon oranını satır içinde düzenler.
 *
 * NEDEN AYRI BİR DÜZENLEME EKRANI DEĞİL: değiştirilebilecek tek alan bu
 * (kod bilinçli olarak sabit, bkz. 067). Tek alan için ayrı bir sayfa
 * açmak, iki tıklamayı beş yapardı.
 *
 * GEÇMİŞE ETKİ ETMEZ ve bu ekranda yazıyor: hakediş satırları o anki
 * oranı kendi içinde saklıyor (partner_commissions.commission_rate), bu
 * yüzden oranı düşürmek çoktan hak edilmiş bir komisyonu geri almaz.
 * Bunu söylemeden bırakmak, yöneticiyi "eski hakedişler ne olacak"
 * sorusuyla baş başa bırakırdı.
 */
export function CommissionRateCell({
  partnerId,
  partnerName,
  rate,
}: {
  partnerId: string
  partnerName: string
  /** 0-1 arası oran; ekranda yüzdeye çevriliyor. */
  rate: number
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(Math.round(rate * 1000) / 10))
  const [pending, startTransition] = useTransition()

  function save() {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error('Komisyon oranı 0 ile 100 arasında bir yüzde olmalı.')
      return
    }

    startTransition(async () => {
      const res = await updatePartnerAction({ partnerId, commissionPercent: parsed })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${partnerName} komisyonu %${parsed} olarak güncellendi.`)
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <span className="flex items-center justify-end gap-0.5">
        <span className="tabular-nums">%{Math.round(rate * 1000) / 10}</span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => setEditing(true)}
          aria-label={`${partnerName} komisyon oranını düzenle`}
        >
          <Pencil className="size-3.5" />
        </Button>
      </span>
    )
  }

  return (
    <span className="flex items-center justify-end gap-1">
      <Input
        type="number"
        min={0}
        max={100}
        step={0.5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        aria-label={`${partnerName} komisyon yüzdesi`}
        autoFocus
        className="h-8 w-20 text-right"
      />
      <Button type="button" size="sm" disabled={pending} onClick={save}>
        {pending ? '…' : 'Kaydet'}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Vazgeç
      </Button>
    </span>
  )
}
