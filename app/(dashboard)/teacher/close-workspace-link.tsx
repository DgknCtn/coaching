'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { closeOwnEmptyWorkspaceAction } from './close-workspace-actions'

// Boş koç alanının küçük çıkış kapısı (138). Yalnız alan tamamen boşken
// çizilir; asıl kural veritabanında.
export function CloseWorkspaceLink() {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      const res = await closeOwnEmptyWorkspaceAction()
      if (res?.error) toast.error(res.error)
    })
  }

  return (
    <>
      <p className="text-center text-xs text-muted-foreground">
        Öğrenci ya da veli misin?{' '}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Bu alanı yanlışlıkla açtım
        </button>
      </p>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Koç alanını kapat</DialogTitle>
            <DialogDescription>
              Bu boş çalışma alanı silinecek. Ardından öğretmeninin davetini kabul edebilir ya da
              ondan kullanıcı adı + PIN isteyebilirsin. Hesabın silinmez.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Alanı kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
