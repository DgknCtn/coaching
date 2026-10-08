'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { memberCodeLoginAction } from './actions'

// ÖĞRENCİ / VELİ GİRİŞİ — KULLANICI ADI + PIN (10a · 138).
//
// Kullanıcı adını ve PIN'i öğretmen verir. PIN unutulursa öğretmen
// yenisini üretir (e-posta sıfırlaması yok).

export function MemberCodeLoginForm() {
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await memberCodeLoginAction(username, pin)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive-border bg-destructive-subtle px-3 py-2.5 text-sm text-destructive-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}
      {/* method="post": PIN de URL'ye yazılmasın (tests/auth-form-method). */}
      <form method="post" onSubmit={submit} noValidate className="space-y-4">
        <fieldset disabled={pending} className="space-y-4 disabled:opacity-70">
          <div className="space-y-2">
            <Label htmlFor="username">Kullanıcı adı</Label>
            <Input
              id="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              placeholder="ayse.y4821"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={6}
              placeholder="••••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
            <p className="text-xs text-muted-foreground">
              PIN&apos;ini unuttuysan öğretmeninden yenisini iste.
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={!username || pin.length !== 6}>
            {pending && <Loader2 className="animate-spin" />}
            Giriş yap
          </Button>
        </fieldset>
      </form>
    </>
  )
}
