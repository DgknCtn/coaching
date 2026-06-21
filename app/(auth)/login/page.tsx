'use client'

import { useTransition, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Loader2, GraduationCap, Check } from 'lucide-react'
import { loginAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().email('Geçerli bir e-posta girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
})

type FormData = z.infer<typeof schema>

const features = [
  'Ödev ve test takibini otomatikleştirin',
  'Risk altındaki öğrencileri anında görün',
  'Velilerle tek tıkla paylaşın',
]

export default function LoginPage() {
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)

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
    <div className="min-h-screen flex">
      {/* Left: Branding */}
      <div className="hidden lg:flex flex-col w-[460px] shrink-0 auth-hero p-12 relative overflow-hidden">
        <div
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, white, transparent)' }}
        />
        <div
          className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, white, transparent)' }}
        />

        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
            <GraduationCap className="size-5 text-white" />
          </div>
          <span className="font-bold text-lg text-white tracking-tight">Koçluk Takip</span>
        </div>

        <div className="flex-1 flex flex-col justify-center relative z-10 mt-16">
          <h2 className="text-3xl font-bold text-white mb-4 leading-snug">
            Öğrencilerinizi<br />
            <span className="text-white/55">tek ekranda</span> takip edin
          </h2>
          <p className="text-white/55 text-sm mb-10 leading-relaxed max-w-xs">
            Kitaplar, testler, ödevler ve veli iletişimi — Excel&apos;e gerek kalmadan.
          </p>

          <div className="space-y-4">
            {features.map((f) => (
              <div key={f} className="flex items-start gap-3 text-sm text-white/70">
                <div className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="size-2.5 text-white" />
                </div>
                {f}
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-white/25 relative z-10">© 2026 Koçluk Takip</p>
      </div>

      {/* Right: Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-[360px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <GraduationCap className="size-4 text-primary" />
            </div>
            <span className="font-bold text-base tracking-tight">Koçluk Takip</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight mb-1.5">Tekrar hoşgeldiniz</h1>
            <p className="text-muted-foreground text-sm">Hesabınıza giriş yapın</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">E-posta</Label>
              <Input
                id="email"
                type="email"
                placeholder="ornek@mail.com"
                autoComplete="email"
                className="h-11"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">Şifre</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                className="h-11"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="rounded-lg bg-destructive/8 border border-destructive/20 px-3.5 py-2.5">
                <p className="text-xs text-destructive">{serverError}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 text-sm font-medium"
              disabled={isPending}
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Giriş Yap
            </Button>
          </form>

          <p className="text-sm text-muted-foreground text-center mt-6">
            Hesabın yok mu?{' '}
            <Link
              href="/register"
              className="text-primary font-medium hover:underline underline-offset-4"
            >
              Kayıt ol
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
