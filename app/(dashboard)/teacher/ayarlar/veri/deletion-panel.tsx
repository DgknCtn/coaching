'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { formatDateTr } from '@/lib/format'
import { requestWorkspaceDeletionAction, cancelDeletionAction } from './actions'

/**
 * ÇALIŞMA ALANI SİLME TALEBİ.
 *
 * ============================================================
 * ÜÇ KATLI ONAY — ABARTI DEĞİL
 *
 * Bu, üründeki en yıkıcı işlem: bir kurumun bütün öğrencileri, ödevleri,
 * kitapları ve finans kayıtları. "Ödendi işaretle" düğmesindeki iki
 * adımlı onay burada yetmez, çünkü orada geri alınamayan şey bir kayıt;
 * burada bütün veri.
 *
 * Bu yüzden kullanıcı çalışma alanının ADINI yazarak onaylıyor: yanlış
 * düğmeye basmak mümkün, kendi kurumunun adını kazara yazmak değil.
 * ============================================================
 *
 * 30 GÜNLÜK PENCERE: talep hemen yürütülmüyor (053). Bu, kötü niyetle ya
 * da öfkeyle açılmış bir talebin geri alınabilmesi için var — bu yüzden
 * iptal düğmesi silme düğmesi kadar görünür.
 */
export function DeletionPanel({
  workspaceName,
  pending,
}: {
  workspaceName: string
  pending: { id: string; executeAfter: string; requestedByName: string | null } | null
}) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const res = await requestWorkspaceDeletionAction(reason)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Silme talebiniz alındı.')
      setOpen(false)
      setConfirmText('')
      setReason('')
    })
  }

  function cancel() {
    if (!pending) return
    startTransition(async () => {
      const res = await cancelDeletionAction(pending.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Silme talebi iptal edildi.')
    })
  }

  if (pending) {
    return (
      <div className="rounded-lg border border-destructive-border bg-destructive-subtle p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-destructive-foreground"
            aria-hidden
          />
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-sm font-medium text-destructive-foreground">
                Silme talebi açık
              </p>
              <p className="mt-1 text-sm text-destructive-foreground">
                {formatDateTr(pending.executeAfter)} tarihinden önce silme
                yapılmaz. Bu tarihe kadar talebi iptal edebilirsiniz; ettiğinizde
                hiçbir veri kaybolmaz.
                {pending.requestedByName && ` Talebi ${pending.requestedByName} açtı.`}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={cancel}>
              {isPending ? 'İptal ediliyor…' : 'Talebi iptal et'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Silme talebi oluştur
      </Button>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-destructive-border p-4">
      <p className="text-sm">
        Bu işlem <strong className="font-medium">{workspaceName}</strong> çalışma
        alanının bütün verisinin silinmesi için talep açar: öğrenciler, ödevler,
        kitap atamaları, destek yazışmaları ve finans kayıtları.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="silme-onay">
          Onaylamak için çalışma alanının adını yazın
        </Label>
        <Input
          id="silme-onay"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={workspaceName}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="silme-neden">Gerekçe (isteğe bağlı)</Label>
        <Textarea
          id="silme-neden"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending || confirmText.trim() !== workspaceName.trim()}
          onClick={submit}
        >
          {isPending ? 'Gönderiliyor…' : 'Silme talebi oluştur'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Vazgeç
        </Button>
      </div>
    </div>
  )
}
