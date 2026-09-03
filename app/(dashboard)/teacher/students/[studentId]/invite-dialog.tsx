'use client'

import { useState, useTransition } from 'react'
import { Copy, Check, UserPlus, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react'
import { createInviteAction } from './invite-actions'
import { BRAND } from '@/lib/brand'
import { inviteTimeLeftLabel } from '@/lib/invite-status'
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
  /** Bu rol için zaten açık bir davet var mı? Uyarı metni buna bağlı. */
  hasPendingInvite?: boolean
}

export function InviteDialog({
  studentId,
  studentName,
  inviteType,
  hasPendingInvite = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{
    link: string
    expiresAt: string
    bound: boolean
  } | null>(null)
  const [email, setEmail] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = () => {
    setError(null)
    startTransition(async () => {
      const res = await createInviteAction(studentId, inviteType, email)
      if (res.error) {
        setError(res.error)
        return
      }
      setResult({ link: res.link!, expiresAt: res.expiresAt!, bound: !!res.bound })
    })
  }

  const handleCopy = () => {
    if (!result) return
    navigator.clipboard.writeText(result.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const label = inviteType === 'student' ? 'Öğrenci Daveti' : 'Veli Daveti'
  const timeLeft = result ? inviteTimeLeftLabel(result.expiresAt) : ''

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        setOpen(v)
        if (!v) {
          setResult(null)
          setError(null)
          setEmail('')
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="xs" variant="outline">
            <UserPlus className="size-3" /> {label}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{studentName}</span> için davet linki oluşturun.
            {inviteType === 'parent' && ' Veli bu linki kullanarak hesap oluşturabilir.'}
          </p>

          {!result ? (
            <>
              {/* Yeni davet eskisini öldürür — kullanıcı bunu ÖNCEDEN bilmeli,
                  sonradan "eski link neden çalışmıyor?" diye sormamalı. */}
              {hasPendingInvite && (
                <p className="rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning-foreground">
                  Bu rol için zaten açık bir davet var. Yeni link oluşturursanız eskisi
                  iptal edilir ve çalışmaz.
                </p>
              )}

              {/* E-posta yalnız velide sorulur ve ZORUNLU DEĞİL: öğretmen çoğu
                  zaman veli e-postasını bilmiyor. Öğrenci davetinde adres zaten
                  öğrenci kaydından geliyor. */}
              {inviteType === 'parent' && (
                <div className="space-y-1.5">
                  <Label htmlFor="inviteEmail" className="text-xs">
                    Veli e-postası <span className="text-muted-foreground">(isteğe bağlı)</span>
                  </Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="veli@ornek.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Girerseniz davet bu adrese kilitlenir ve linki başkası kullanamaz.
                    Boş bırakırsanız linki eline geçiren herkes veli olarak
                    kaydolabilir; bu yüzden süre 48 saatle sınırlıdır.
                  </p>
                </div>
              )}

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
                  <Input value={result.link} readOnly className="text-xs" />
                  <Button size="icon" variant="outline" onClick={handleCopy}>
                    {copied ? (
                      <Check className="size-4 text-success" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Kilitli mi değil mi, kullanıcı bunu görmeli: paylaşırken ne
                  kadar dikkatli olması gerektiğini belirleyen tek şey bu. */}
              <p
                className={
                  result.bound
                    ? 'flex items-start gap-1.5 text-xs text-success-foreground'
                    : 'flex items-start gap-1.5 text-xs text-warning-foreground'
                }
              >
                {result.bound ? (
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                ) : (
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                )}
                {result.bound
                  ? 'Bu link yalnız belirtilen e-posta adresiyle kullanılabilir.'
                  : 'Bu link herhangi bir e-postayla kullanılabilir — yalnız doğru kişiye gönderin.'}
              </p>

              <p className="text-xs text-muted-foreground">
                {timeLeft} · Tek kullanımlıktır. Yeni link oluşturursanız bu link iptal
                olur.
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    const text = `Merhaba! ${BRAND.name}'e davet edildiniz.\n\nLink: ${result.link}\n\n${timeLeft}.`
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
                    window.open(
                      `https://t.me/share/url?url=${encodeURIComponent(result.link)}&text=${encodeURIComponent(`${BRAND.name} daveti`)}`,
                      '_blank'
                    )
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
