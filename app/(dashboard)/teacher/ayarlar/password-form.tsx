'use client'

// ŞİFRE DEĞİŞTİRME FORMU (072).
//
// Şifre bugüne kadar yalnız "şifremi unuttum" akışıyla değiştirilebiliyordu:
// oturumu açık olan kullanıcının kendi şifresini değiştirmesi için
// e-postasına bağlantı istemesi gerekiyordu.
//
// MEVCUT ŞİFRE SORULUR — sunucu da ayrıca doğrular. Açık bırakılmış bir
// bilgisayarın başına geçen biri, sorulmazsa hesabı tek tıkla ele geçirir.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { changePasswordAction } from './actions'

export function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => {
          const res = await changePasswordAction(current, next, confirm)
          if (res.error) {
            toast.error(res.error)
            return
          }
          toast.success('Şifreniz güncellendi.')
          setCurrent('')
          setNext('')
          setConfirm('')
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="current-password">Mevcut şifre</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-password">Yeni şifre</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password-confirm">Yeni şifre (tekrar)</Label>
          <Input
            id="new-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
      </div>

      <Button
        type="submit"
        size="sm"
        disabled={pending || !current || !next || !confirm}
      >
        {pending && <Loader2 className="animate-spin" />}
        Şifreyi değiştir
      </Button>
    </form>
  )
}
