'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { acceptInviteAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  fullName: z.string().min(2, 'Ad en az 2 karakter'),
  email: z.string().email('Geçerli e-posta girin'),
  password: z.string().min(6, 'Şifre en az 6 karakter'),
})
type FormData = z.infer<typeof schema>

interface Props {
  token: string
  defaultEmail?: string
}

export function InviteForm({ token, defaultEmail }: Props) {
  const [isPending, startTransition] = useTransition()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: defaultEmail ?? '' },
  })

  const onSubmit = (data: FormData) => {
    setServerError(null)
    startTransition(async () => {
      const result = await acceptInviteAction(token, data.fullName, data.email, data.password)
      if (result?.error) setServerError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="fullName" className="text-sm font-medium">Ad Soyad</Label>
        <Input id="fullName" placeholder="Ahmet Yılmaz" className="h-11" aria-invalid={!!errors.fullName} {...register('fullName')} />
        {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-sm font-medium">E-posta</Label>
        <Input id="email" type="email" autoComplete="email" className="h-11" aria-invalid={!!errors.email} {...register('email')} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-sm font-medium">Şifre belirle</Label>
        <Input id="password" type="password" autoComplete="new-password" className="h-11" aria-invalid={!!errors.password} {...register('password')} />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>
      {serverError && (
        <div className="rounded-lg bg-destructive/8 border border-destructive/20 px-3.5 py-2.5">
          <p className="text-xs text-destructive">{serverError}</p>
        </div>
      )}
      <Button type="submit" className="w-full h-11 font-medium" disabled={isPending}>
        {isPending && <Loader2 className="size-4 animate-spin" />}
        Hesap Oluştur ve Katıl
      </Button>
    </form>
  )
}
