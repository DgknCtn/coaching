'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

// Geri dönüşü zor işlemler için onay penceresi (M1.0-01 §1).
//
// `requireText` verilirse onay butonu, kullanıcı o metni (ör. öğrencinin
// tam adı) birebir yazana kadar kapalı kalır — kalıcı silmede "bilinçli
// onay" şartı. Sunucu da aynı eşleşmeyi ayrıca denetler; bu yalnız ilk kapı.

interface Props {
  trigger: ReactNode
  title: string
  description: ReactNode
  confirmLabel: string
  destructive?: boolean
  requireText?: string
  /** `typed`: requireText alanına yazılan metin (sunucu da denetlesin diye). */
  onConfirm: (typed: string) => Promise<{ error?: string } | undefined | void>
  successMessage?: string
  onDone?: () => void
}

export function ConfirmActionDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  requireText,
  onConfirm,
  successMessage,
  onDone,
}: Props) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const matches = !requireText || typed.trim() === requireText.trim()

  function confirm() {
    setError(null)
    startTransition(async () => {
      const result = await onConfirm(typed.trim())
      if (result && result.error) {
        setError(result.error)
        return
      }
      if (successMessage) toast.success(successMessage)
      setOpen(false)
      onDone?.()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        // İstek sürerken kapatılırsa sonuç kaybolur; kapatma engellenir.
        if (isPending) return
        setOpen(v)
        if (!v) {
          setTyped('')
          setError(null)
        }
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription render={<div />}>{description}</DialogDescription>
        </DialogHeader>

        {requireText && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-text" className="text-xs">
              Onaylamak için <span className="font-semibold">{requireText}</span> yazın
            </Label>
            <Input
              id="confirm-text"
              autoComplete="off"
              value={typed}
              onChange={e => setTyped(e.target.value)}
            />
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={isPending} />}>
            Vazgeç
          </DialogClose>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={confirm}
            disabled={isPending || !matches}
          >
            {isPending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
