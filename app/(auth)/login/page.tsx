'use client'

import { useTransition, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { loginAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from '@/components/shared/auth-shell'
import { GoogleButton } from '@/components/shared/google-button'
import { TRIAL_DAYS } from '@/lib/plans'

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

export default function LoginPage() {
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = (data: FormData) => {
    setServerError(null)
    startTransition(async () => {
      const result = await loginAction(data.email, data.password)
      if (result?.error) setServerError(result.error)
    })
  }

  return (
    <AuthShell
      title="Tekrar hoş geldiniz"
      description="Kaldığınız yerden devam edin."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Hesabınız yok mu?{' '}
          <Link
            href="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {TRIAL_DAYS} gün ücretsiz deneyin
          </Link>
        </p>
      }
    >
      {/* GOOGLE FORMUN ÜSTÜNDE: en hızlı yol en görünür yerde olmalı.
          Altta olsaydı kullanıcı e-posta/şifre alanlarını doldurmaya
          başladıktan sonra fark ederdi. */}
      <GoogleButton />

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-2 text-xs text-muted-foreground">veya</span>
        </div>
      </div>

      {/* SUNUCU HATASI FORMUN ÜSTÜNDE VE role="alert" İLE.
          Önce düğmenin hemen üstünde, alan hatalarıyla aynı boyutta bir
          satırdı: ekran okuyucuya hiç duyurulmuyordu ve küçük ekranda
          kaydırma dışında kalabiliyordu. "Şifreniz hatalı" mesajının
          fark edilmemesi, kullanıcının aynı şifreyi tekrar denemesi
          demektir. */}
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
          form kilitlenir. Yalnız düğme kapatıldığında kullanıcı istek
          uçarken e-postayı değiştirebiliyor ve ekranda gördüğünden başka
          bir adresle giriş yapmış oluyordu.

          noValidate: doğrulama zod ile yapılıyor; tarayıcının kendi
          balonu Türkçe hata metinlerinin önüne geçip iki farklı dilde
          iki farklı mesaj gösterirdi. */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <fieldset disabled={isPending} className="space-y-4 disabled:opacity-70">
          <div className="space-y-2">
            <Label htmlFor="email">E-posta</Label>
            <Input
              id="email"
              type="email"
              placeholder="ornek@mail.com"
              autoComplete="email"
              // Ekranın tek işi var; imleç ilk alanda başlasın ki klavye
              // kullanıcısı önce Tab'a basmak zorunda kalmasın.
              autoFocus
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
                doğrulanamıyor. Düğme alanın İÇİNDE duruyor; ayrı bir onay
                kutusu, hangi alanla ilgili olduğunu kurmayı kullanıcıya
                bırakırdı. */}
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
                // arasına girmesi klavye kullanıcısını her seferinde bir
                // durak yavaşlatırdı. Fare/dokunmatik için erişilebilir
                // kalıyor, ekran okuyucu etiketi de var.
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

          {/* METİN KAYBOLMUYOR: eskiden bekleme sırasında düğme yalnız
              dönen bir simgeye dönüşüyordu; ekran ne olup bittiğini
              söylemiyordu. */}
          <Button type="submit" className="w-full gap-2">
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {isPending ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </Button>
        </fieldset>
      </form>
    </AuthShell>
  )
}
