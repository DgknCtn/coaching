'use client'

import { useTransition, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { registerAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from '@/components/shared/auth-shell'
import { Check, ShieldCheck } from 'lucide-react'
import { TRIAL_CTA_LABEL, TRIAL_DAYS } from '@/lib/plans'
import { registerSchema } from '@/lib/validation'
import { GoogleButton } from '@/components/shared/google-button'

// ŞEMA SUNUCUYLA ORTAK. Burada ayrı bir kopya vardı ve mesajları
// sunucudakinden ayrışmıştı ("Ad en az 2 karakter olmalı" vs "Ad Soyad
// en az 2 karakter olmalı."): aynı formu iki kez doğrulayan iki farklı
// kural. Alan `workspaceName` şemada KALIYOR — form artık sormasa da
// e-posta doğrulaması açıkken çalışma alanı, kullanıcı metadata'sından
// sonradan kuruluyor ve o yol alanı okuyor.
const schema = registerSchema

type FormData = z.infer<typeof schema>

// "Kaydolduktan sonra ne olacak?" sorusunun cevabı. Dördü de üründe
// bugün var ve onboarding listesindeki adımlarla aynı sırada
// (onboarding-checklist.tsx) — vaat ile ekran birbirini tutuyor.
const FIRST_10_MIN = [
  'Öğrencilerinizi ekleyin',
  'İlk ödevinizi oluşturun',
  'Kitap takibini başlatın',
  'Öğrencinizin ilerlemesini görün',
]

const TRUST = [
  'Kredi kartı gerekmez',
  'Otomatik ödeme yok',
  'Kurulum gerektirmez',
]

export default function RegisterPage() {
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)
  // E-posta doğrulaması açıkken kayıt oturum açmaz; kullanıcıya ne
  // olduğunu ve ne yapması gerektiğini söylemek zorundayız, yoksa form
  // hiçbir şey olmamış gibi durur.
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = (data: FormData) => {
    setServerError(null)
    startTransition(async () => {
      const result = await registerAction(data.fullName, data.email, data.password)
      if (result?.error) {
        setServerError(result.error)
        return
      }
      if (result?.needsVerification) setVerifyEmail(result.email ?? data.email)
    })
  }

  if (verifyEmail) {
    return (
      <AuthShell
        title="E-postanızı doğrulayın"
        description="Hesabınız oluşturuldu, son bir adım kaldı"
        footer={
          <p className="text-center text-sm text-muted-foreground">
            Doğruladıktan sonra{' '}
            <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              giriş yapabilirsiniz
            </Link>
          </p>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{verifyEmail}</span> adresine bir
            doğrulama bağlantısı gönderdik. Bağlantıya tıkladığınızda çalışma alanınız
            kurulacak ve panelinize yönlendirileceksiniz.
          </p>
          <p className="text-sm text-muted-foreground">
            E-posta birkaç dakika içinde gelmezse spam klasörünü kontrol edin.
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Öğrencilerinizi yönetmeye başlayın."
      description={`${TRIAL_DAYS} gün boyunca tüm özellikleri ücretsiz deneyin. Kredi kartı gerekmez.`}
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Zaten hesabın var mı?{' '}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Giriş yap
          </Link>
        </p>
      }
    >
      {/* GOOGLE FORMUN ÜSTÜNDE: en hızlı yol en görünür yerde olmalı.
          Altta olsaydı kullanıcı e-posta/şifre alanlarını doldurmaya
          başladıktan sonra fark ederdi. */}
      {/* İLK 10 DAKİKA formun üstünde: kayıt formu bir maliyet, bu liste
          onun karşılığı. Altında olsaydı kullanıcı zaten karar verdikten
          sonra görürdü. */}
      <div className="mb-5 rounded-lg border bg-muted/30 p-4">
        <p className="text-sm font-medium">İlk 10 dakikada:</p>
        <ul className="mt-2 space-y-1.5">
          {FIRST_10_MIN.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <GoogleButton />
      <p className="mt-2 text-center text-xs text-muted-foreground">
        En hızlı yöntem — 30 saniyede hesabınızı oluşturun.
      </p>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-2 text-xs text-muted-foreground">veya</span>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Ad Soyad</Label>
          <Input
            id="fullName"
            type="text"
            autoComplete="name"
            aria-invalid={!!errors.fullName}
            {...register('fullName')}
          />
          {errors.fullName && (
            <p className="text-xs text-destructive">{errors.fullName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">E-posta</Label>
          <Input
            id="email"
            type="email"
            placeholder="ornek@mail.com"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Şifre</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
          {errors.password && (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          )}
        </div>

        {/* ÇALIŞMA ALANI ADI SORULMUYOR: ilk kayıtta "çalışma alanı
            nedir?" sorusunu doğuruyordu ve zaten isteğe bağlıydı. Boş
            geçildiğinde sunucu adı kendisi üretiyor (064). Kullanıcı
            adı sonradan ayarlardan değiştirebilir. */}

        {serverError && (
          <p className="text-xs text-destructive">{serverError}</p>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {TRIAL_CTA_LABEL}
        </Button>

        {/* GÜVENCE SATIRI kayıt bağlamına ait: pazarlama sayfasındaki
            GuaranteeStrip'in vaatlerini tekrar etmiyor, kaydolmadan
            hemen önceki çekinceyi karşılıyor. */}
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 pt-1 text-xs text-muted-foreground">
          {TRUST.map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-success-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </form>
    </AuthShell>
  )
}
