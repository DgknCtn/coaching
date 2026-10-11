'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { requestPinResetAction } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// "PIN'İMİ UNUTTUM" (143).
//
// Öğrenci ya da veli kullanıcı adını yazar; öğretmenin paneline bir istek
// düşer. Öğretmen "Yeni PIN" deyince istek kendiliğinden kapanır. Yanıt
// her durumda aynıdır (kullanıcı adı var mı, sızdırılmaz).

export function PinRequestForm() {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        PIN&apos;imi unuttum
      </button>
    )
  }

  if (sent) {
    return (
      <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        İsteğin iletildi. Öğretmenin yeni PIN verince sana iletecek.
      </p>
    )
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await requestPinResetAction(username)
      if (res.success) setSent(true)
      else setError(res.error ?? 'İstek gönderilemedi, tekrar dene.')
    })
  }

  return (
    // method="post": kullanıcı adı URL'ye yazılmasın (tests/auth-form-method).
    <form method="post" onSubmit={submit} noValidate className="space-y-3 text-left">
      <fieldset disabled={pending} className="space-y-3 disabled:opacity-70">
        <div className="space-y-2">
          <Label htmlFor="pin-request-username">Kullanıcı adın</Label>
          <Input
            id="pin-request-username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            placeholder="ayse.y4821"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" variant="outline" className="w-full gap-2" disabled={!username}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Öğretmenime bildir
        </Button>
      </fieldset>
    </form>
  )
}
