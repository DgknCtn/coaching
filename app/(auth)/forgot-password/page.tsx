'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { requestPasswordResetAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from '@/components/shared/auth-shell'

const schema = z.object({
  email: z.string().email('Geçerli bir e-posta girin'),
})

type FormData = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = (data: FormData) => {
    setServerError(null)
    startTransition(async () => {
      const result = await requestPasswordResetAction(data.email)
      if (result?.error) {
        setServerError(result.error)
        return
      }
      setSent(true)
    })
  }

  return (
    <AuthShell
      title="Şifreni sıfırla"
      description="E-posta adresine bir sıfırlama bağlantısı gönderelim"
      footer={
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Girişe dön
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="space-y-3">
          <p className="text-sm">
            Bu adres kayıtlıysa sıfırlama bağlantısı gönderildi. Gelen kutunu
            (ve spam klasörünü) kontrol et.
          </p>
          <p className="text-xs text-muted-foreground">
            Bağlantı kısa süre içinde geçerliliğini yitirir; gelmezse birkaç
            dakika sonra tekrar deneyebilirsin.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

          {serverError && <p className="text-xs text-destructive">{serverError}</p>}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : 'Sıfırlama bağlantısı gönder'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
