'use client'

import { useEffect, useTransition, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { loginAction } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// E-POSTA + ŞİFRE GİRİŞ FORMU — koç girişi (/login) ve öğrenci/veli
// girişi (/giris) aynı formu kullanıyor. İki kopya, bu dosyadaki
// kararların (method="post", fieldset kilidi, şifreyi göster) birinde
// unutulması demekti.

// E-POSTA BOŞLUKLARI KIRPILIR.
//
// Şifre yöneticisinden ya da bir e-postadan kopyalanan adres sık sık
// başında veya sonunda boşlukla gelir; kullanıcı gözle göremediği bir
// karakter yüzünden "böyle bir hesap yok" hatası alırdı. Kırpma
// DOĞRULAMADAN ÖNCE yapılır, yoksa geçerli adres geçersiz sayılır.
//
// ŞİFRE KIRPILMAZ: baştaki/sondaki boşluk şifrenin gerçek parçası
// olabilir ve sessizce silmek, doğru şifreyle giriş yapılamaması demek.
const schema = z.object({
  email: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().email('Geçerli bir e-posta girin')),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
})

type FormData = z.infer<typeof schema>

// /auth/callback'in döndürdüğü hata kodları. Önceden callback bu kodla
// buraya yönlendiriyordu ama sayfa parametreyi hiç okumuyordu: Google
// girişi yarıda kalan kullanıcı açıklamasız bir giriş formuna düşüyordu.
const CALLBACK_ERRORS: Record<string, string> = {
  google: 'Google ile giriş tamamlanamadı. Tekrar deneyin ya da e-posta ve şifreyle girin.',
  gecersiz_baglanti: 'Bağlantı geçersiz. Lütfen yeniden giriş yapın.',
  baglanti_suresi_doldu: 'Bağlantının süresi dolmuş. Lütfen yeniden giriş yapın.',
}

export function EmailLoginForm({
  next,
  autoFocus = false,
}: {
  /** Girişten sonra gidilecek uygulama içi yol. */
  next?: string
  autoFocus?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  // useSearchParams yerine window: sayfa statik üretiliyor ve
  // useSearchParams bir Suspense sınırı gerektirirdi.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error')
    if (code && CALLBACK_ERRORS[code]) setServerError(CALLBACK_ERRORS[code])
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = (data: FormData) => {
    setServerError(null)
    startTransition(async () => {
      const result = await loginAction(data.email, data.password, next)
      if (result?.error) setServerError(result.error)
    })
  }

  return (
    <>
      {/* SUNUCU HATASI FORMUN ÜSTÜNDE VE role="alert" İLE.
          Önce düğmenin hemen üstünde, alan hatalarıyla aynı boyutta bir
          satırdı: ekran okuyucuya hiç duyurulmuyordu ve küçük ekranda
          kaydırma dışında kalabiliyordu. */}
      {serverError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive-border bg-destructive-subtle px-3 py-2.5 text-sm text-destructive-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{serverError}</span>
        </div>
      )}

      {/* fieldset disabled: bekleme sırasında yalnız düğme değil BÜTÜN
          form kilitlenir; kullanıcı istek uçarken e-postayı değiştirip
          ekranda gördüğünden başka bir adresle giriş yapmış olmasın.

          noValidate: doğrulama zod ile; tarayıcının balonu Türkçe
          mesajların önüne geçerdi.

          method="post": ŞİFRE URL'YE YAZILMASIN. JS hazır olmadan Enter'a
          basılırsa tarayıcı kendi varsayılanını (GET) uygular; canlıda
          /login?email=…&password=… görüldü (tests/auth-form-method). */}
      <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate>
        <fieldset disabled={isPending} className="space-y-4 disabled:opacity-70">
          <div className="space-y-2">
            <Label htmlFor="email">E-posta</Label>
            <Input
              id="email"
              type="email"
              placeholder="ornek@mail.com"
              autoComplete="email"
              autoFocus={autoFocus}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
            {errors.email && (
              <p id="email-error" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Şifre</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Şifremi unuttum
              </Link>
            </div>

            {/* ŞİFREYİ GÖSTER: yanlış yazılmış şifre giriş ekranındaki en
                sık başarısızlık sebebi ve mobil klavyede gözle
                doğrulanamıyor. */}
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-10"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                // Sekme sırasının dışında: şifre alanı ile "Giriş Yap"
                // arasına girmesi klavye kullanıcısını yavaşlatırdı.
                tabIndex={-1}
                aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                aria-pressed={showPassword}
                title={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </button>
            </div>

            {errors.password && (
              <p id="password-error" className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* METİN KAYBOLMUYOR: bekleme sırasında düğme ne olup bittiğini
              söylemeye devam ediyor. */}
          <Button type="submit" className="w-full gap-2">
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {isPending ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </Button>
        </fieldset>
      </form>
    </>
  )
}
