'use client'

import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

// YÖNETİM İŞLEMİ DİYALOĞU (128).
//
// Her işlem: ne değişecek (önizleme) → gerekçe (zorunlu, 10+ karakter,
// yönetim kaydına değişmez olarak yazılır) → onay. Yıkıcı işlemde
// (askıya alma) ayrıca alan adının AYNEN yazılması istenir: yanlış
// satırda açılmış bir diyaloğu refleksle onaylamayı önler.

export function ActionDialog({
  triggerLabel,
  title,
  description,
  preview,
  confirmPhrase,
  submitLabel,
  destructive = false,
  successMessage,
  children,
  onSubmit,
  onOpenChange,
  trigger,
}: {
  triggerLabel: string
  /** Varsayılan düğme yerine özel tetik (ör. simge düğmesi). */
  trigger?: React.ReactElement
  title: string
  description?: string
  /** "Şu değişecek" — alan değerlerine göre canlı. */
  preview?: React.ReactNode
  /** Verilirse onay için aynen yazılmalı (ör. alan adı). */
  confirmPhrase?: string
  submitLabel: string
  destructive?: boolean
  successMessage: string
  /** İşleme özgü alanlar (gün, ay, öğrenci…). */
  children?: React.ReactNode
  onSubmit: (reason: string) => Promise<{ error?: string }>
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const id = useId()

  const reasonOk = reason.trim().length >= 10
  const confirmOk = !confirmPhrase || confirm.trim() === confirmPhrase.trim()

  function change(next: boolean) {
    setOpen(next)
    onOpenChange?.(next)
    if (!next) {
      setReason('')
      setConfirm('')
      setError(null)
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await onSubmit(reason)
      if (res.error) {
        setError(res.error)
        return
      }
      toast.success(successMessage)
      change(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm" variant={destructive ? 'destructive' : 'outline'}>
              {triggerLabel}
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={submit} className="mt-2 space-y-4">
          {children}

          {preview && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Şu değişecek
              </p>
              {preview}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`${id}-reason`}>Gerekçe</Label>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={10}
              maxLength={500}
              rows={3}
              aria-describedby={`${id}-reason-hint`}
            />
            <p id={`${id}-reason-hint`} className="text-xs text-muted-foreground">
              En az 10 karakter. Yönetim kaydına yazılır ve sonradan değiştirilemez.
            </p>
          </div>

          {confirmPhrase && (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-confirm`}>
                Onaylamak için <span className="font-semibold">{confirmPhrase}</span> yazın
              </Label>
              <Input
                id={`${id}-confirm`}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => change(false)} disabled={pending}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              disabled={pending || !reasonOk || !confirmOk}
            >
              {pending ? 'Uygulanıyor…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
