'use client'

import { useState, useTransition } from 'react'
import { Copy, Check, UserPlus, Loader2 } from 'lucide-react'
import { createInviteAction } from './invite-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface Props {
  studentId: string
  studentName: string
  inviteType: 'student' | 'parent'
}

export function InviteDialog({ studentId, studentName, inviteType }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = () => {
    setError(null)
    startTransition(async () => {
      const result = await createInviteAction(studentId, inviteType)
      if (result.error) {
        setError(result.error)
      } else {
        setInviteLink(result.link!)
      }
    })
  }

  const handleCopy = () => {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const label = inviteType === 'student' ? 'Öğrenci Daveti' : 'Veli Daveti'

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setInviteLink(null); setError(null) } }}>
      <DialogTrigger render={<Button size="xs" variant="outline"><UserPlus className="size-3" /> {label}</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{studentName}</span> için davet linki oluşturun.
            {inviteType === 'parent' && ' Veli bu linki kullanarak hesap oluşturabilir.'}
          </p>

          {!inviteLink ? (
            <>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button onClick={handleGenerate} disabled={isPending} className="w-full">
                {isPending && <Loader2 className="size-4 animate-spin" />}
                Davet Linki Oluştur
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Davet Linki</Label>
                <div className="flex gap-2">
                  <Input value={inviteLink} readOnly className="text-xs" />
                  <Button size="icon" variant="outline" onClick={handleCopy}>
                    {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Link 7 gün geçerlidir. Tek kullanımlıktır.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    const text = `Merhaba! Koçluk Takip Sistemi'ne davet edildiniz.\n\nLink: ${inviteLink}\n\nLink 7 gün geçerlidir.`
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
                  }}
                >
                  WhatsApp
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    const text = `Koçluk Takip Sistemi'ne davet edildiniz: ${inviteLink}`
                    window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('Koçluk Takip Sistemi daveti')}`, '_blank')
                  }}
                >
                  Telegram
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
