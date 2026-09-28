'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionDialog } from '@/components/admin/action-dialog'
import { updatePartnerAction } from './actions'

/**
 * Komisyon oranını düzenler.
 *
 * GEÇMİŞE ETKİ ETMEZ ve bu ekranda yazıyor: hakediş satırları o anki
 * oranı kendi içinde saklıyor (partner_commissions.commission_rate), bu
 * yüzden oranı düşürmek çoktan hak edilmiş bir komisyonu geri almaz.
 *
 * GEREKÇELİ (129): oran para demek; değişiklik önce → sonra ve gerekçeyle
 * yönetim kaydına girer. Satır içi düzenleme bu yüzden diyaloğa taşındı.
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
  const current = Math.round(rate * 1000) / 10
  const [value, setValue] = useState(String(current))
  const parsed = Number(value)
  const valid = value.trim() !== '' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100

  return (
    <span className="flex items-center justify-end gap-0.5">
      <span className="tabular-nums">%{current}</span>
      <ActionDialog
        triggerLabel="Düzenle"
        trigger={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`${partnerName} komisyon oranını düzenle`}
          >
            <Pencil className="size-3.5" />
          </Button>
        }
        title="Komisyon oranını değiştir"
        description="Yalnız bundan sonraki ödemeleri etkiler; hak edilmiş komisyonlar eski oranla kalır."
        submitLabel="Kaydet"
        successMessage={`${partnerName} komisyonu %${parsed} olarak güncellendi.`}
        preview={
          valid ? (
            <p>
              Oran: <span className="text-muted-foreground">%{current}</span> →{' '}
              <span className="font-medium">%{parsed}</span>
            </p>
          ) : (
            <p className="text-muted-foreground">0 ile 100 arasında bir yüzde girin.</p>
          )
        }
        onOpenChange={(open) => open && setValue(String(current))}
        onSubmit={(reason) =>
          valid
            ? updatePartnerAction({ partnerId, commissionPercent: parsed, reason })
            : Promise.resolve({ error: 'Komisyon oranı 0 ile 100 arasında bir yüzde olmalı.' })
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor={`rate-${partnerId}`}>Yeni oran (%)</Label>
          <Input
            id={`rate-${partnerId}`}
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="max-w-28"
          />
        </div>
      </ActionDialog>
    </span>
  )
}
