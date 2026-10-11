'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { unifiedLoginAction } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// TEK GİRİŞ FORMU — koç, öğrenci ve veli.
//
// İki alan: "E-posta veya kullanıcı adı" ve "Şifre veya PIN". Rol
// sorulmaz; sunucu girdide `@` olup olmadığına bakar (unifiedLoginAction).
// Eskiden /login (koç) ve /giris (öğrenci/veli) ayrı kapılardı ve
// kullanıcılar hangisini kullanacaklarını karıştırıyordu.
//
// E-POSTA BOŞLUKLARI KIRPILIR (sunucuda); ŞİFRE KIRPILMAZ: baştaki ya da
// sondaki boşluk şifrenin gerçek parçası olabilir.

// /auth/callback'in döndürdüğü hata kodları.
const CALLBACK_ERRORS: Record<string, string> = {
  google: 'Google ile giriş artık kullanılmıyor. E-postanla ve şifrenle gir; şifren yoksa "Şifremi unuttum" ile belirle.',
  gecersiz_baglanti: 'Bağlantı geçersiz. Lütfen yeniden giriş yapın.',
  baglanti_suresi_doldu: 'Bağlantının süresi dolmuş. Lütfen yeniden giriş yapın.',
}

export function UnifiedLoginForm({ next }: { next?: string }) {
  const [identifier, setIdentifier] = useState('')
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // useSearchParams yerine window: sayfa statik üretiliyor ve
  // useSearchParams bir Suspense sınırı gerektirirdi.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error')
    if (code && CALLBACK_ERRORS[code]) setError(CALLBACK_ERRORS[code])
  }, [])

  const isEmail = identifier.includes('@')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await unifiedLoginAction(identifier, secret, next)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <>
      {/* Sunucu hatası formun üstünde ve role="alert" ile: ekran okuyucuya
          duyurulsun, küçük ekranda kaydırma dışında kalmasın. */}
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive-border bg-destructive-subtle px-3 py-2.5 text-sm text-destructive-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* method="post": şifre/PIN URL'ye yazılmasın — JS hazır olmadan
          Enter'a basılırsa tarayıcı varsayılan GET'i uygular
          (tests/auth-form-method). fieldset disabled: istek uçarken
          bütün form kilitlenir. noValidate: doğrulama sunucuda. */}
      <form method="post" onSubmit={submit} noValidate>
        <fieldset disabled={pending} className="space-y-4 disabled:opacity-70">
          <div className="space-y-2">
            <Label htmlFor="identifier">E-posta veya kullanıcı adı</Label>
            <Input
              id="identifier"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              placeholder="ornek@mail.com ya da ayse.y4821"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="secret">Şifre veya PIN</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Şifremi unuttum
              </Link>
            </div>
            <div className="relative">
              <Input
                id="secret"
                name="password"
                type={showSecret ? 'text' : 'password'}
                // Kullanıcı adı yazıldıysa mobilde sayı klavyesi açılsın.
                inputMode={identifier && !isEmail ? 'numeric' : undefined}
                autoComplete="current-password"
                className="pr-10"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                tabIndex={-1}
                aria-label={showSecret ? 'Gizle' : 'Göster'}
                aria-pressed={showSecret}
                title={showSecret ? 'Gizle' : 'Göster'}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
              >
                {showSecret ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full gap-2" disabled={!identifier || !secret}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {pending ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </Button>
        </fieldset>
      </form>
    </>
  )
}
