'use client'

import { useTransition, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Loader2, GraduationCap, BookOpen, Users, Zap, ArrowRight } from 'lucide-react'
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
  {
    icon: BookOpen,
    title: 'Kitap & Test Takibi',
    desc: 'Ödevleri otomatikleştirin, tamamlanma oranlarını anlık izleyin.',
  },
  {
    icon: Zap,
    title: 'Risk Analizi',
    desc: 'Gecikme ve risk altındaki öğrencileri tek bakışta görün.',
  },
  {
    icon: Users,
    title: 'Veli İletişimi',
    desc: 'Velileri tek tıkla davet edin, şeffaf ilerleme paylaşın.',
  },
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
      {/* Left: Hero panel */}
      <div className="hidden lg:flex flex-col w-[520px] shrink-0 auth-hero dot-grid relative overflow-hidden">
        {/* Glow orbs */}
        <div
          className="absolute -top-40 -left-20 w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, oklch(0.57 0.26 282 / 0.18) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, oklch(0.48 0.22 265 / 0.15) 0%, transparent 70%)' }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3 px-12 pt-10">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.48 0.22 265))' }}
          >
            <GraduationCap className="size-5 text-white" />
          </div>
          <span className="font-extrabold text-lg text-white tracking-tight">Koçluk Takip</span>
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-12">
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/8 border border-white/12 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-white/60 font-semibold tracking-wide">Eğitim Koçluğu Platformu</span>
            </div>
            <h2 className="text-5xl font-black text-white mb-5 leading-[1.1] tracking-tight">
              Öğrencilerinizi<br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(135deg, oklch(0.80 0.18 282), oklch(0.85 0.12 265))' }}
              >
                akıllıca
              </span>{' '}
              takip<br />
              edin
            </h2>
            <p className="text-white/50 text-base leading-relaxed max-w-xs">
              Kitaplar, testler, ödevler ve veli iletişimi — Excel&apos;e gerek kalmadan.
            </p>
          </div>

          <div className="space-y-4">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="size-4 text-white/70" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white/85">{title}</p>
                  <p className="text-xs text-white/45 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="flex gap-8 mt-12 pt-8 border-t border-white/8">
            {[
              { value: '3', label: 'Kullanıcı rolü' },
              { value: '100%', label: 'Web tabanlı' },
              { value: '7/24', label: 'Erişim' },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="text-2xl font-black text-white">{value}</p>
                <p className="text-xs text-white/35 mt-0.5 font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-[11px] text-white/18 px-12 pb-8">
          © 2026 Koçluk Takip · Tüm hakları saklıdır
        </p>
      </div>

      {/* Right: Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.48 0.22 265))' }}
            >
              <GraduationCap className="size-4 text-white" />
            </div>
            <span className="font-extrabold text-base tracking-tight">Koçluk Takip</span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-black tracking-tight mb-2">Tekrar hoşgeldiniz</h1>
            <p className="text-muted-foreground text-sm">Hesabınıza giriş yaparak devam edin</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">E-posta</Label>
              <Input
                id="email"
                type="email"
                placeholder="ornek@mail.com"
                autoComplete="email"
                className="h-12 rounded-xl border-border/80 bg-card shadow-xs focus-visible:ring-2 focus-visible:ring-primary/30"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              {errors.email && (
                <p className="text-xs text-destructive font-medium">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold">Şifre</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                className="h-12 rounded-xl border-border/80 bg-card shadow-xs focus-visible:ring-2 focus-visible:ring-primary/30"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              {errors.password && (
                <p className="text-xs text-destructive font-medium">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="rounded-xl bg-destructive/8 border border-destructive/20 px-4 py-3.5">
                <p className="text-xs text-destructive font-medium">{serverError}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-sm font-bold rounded-xl shadow-md gap-2"
              style={{
                background: 'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))',
              }}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Giriş Yap
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </form>

          <div className="relative my-7">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted-foreground">veya</span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            Hesabın yok mu?{' '}
            <Link
              href="/register"
              className="text-primary font-bold hover:underline underline-offset-4"
            >
              Kayıt ol
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
