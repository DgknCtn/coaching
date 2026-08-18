'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { updatePasswordAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell } from '@/components/shared/auth-shell'

const schema = z
  .object({
    password: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
    passwordConfirm: z.string().min(6, 'Şifre en az 6 karakter olmalı'),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: 'Şifreler eşleşmiyor',
    path: ['passwordConfirm'],
  })

type FormData = z.infer<typeof schema>

export default function UpdatePasswordPage() {
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
      const result = await updatePasswordAction(data.password, data.passwordConfirm)
      if (result?.error) setServerError(result.error)
    })
  }

  return (
    <AuthShell
      title="Yeni şifre belirle"
      description="Bundan sonra bu şifreyle giriş yapacaksın"
      footer={
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/forgot-password" className="font-medium text-primary underline-offset-4 hover:underline">
            Yeni bağlantı iste
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Yeni şifre</Label>
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

        <div className="space-y-2">
          <Label htmlFor="passwordConfirm">Yeni şifre (tekrar)</Label>
          <Input
            id="passwordConfirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.passwordConfirm}
            {...register('passwordConfirm')}
          />
          {errors.passwordConfirm && (
            <p className="text-xs text-destructive">{errors.passwordConfirm.message}</p>
          )}
        </div>

        {serverError && <p className="text-xs text-destructive">{serverError}</p>}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : 'Şifreyi güncelle'}
        </Button>
      </form>
    </AuthShell>
  )
}
