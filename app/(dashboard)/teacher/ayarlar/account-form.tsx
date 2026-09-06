'use client'

// HESAP BİLGİLERİ FORMU (072).
//
// Koçun kendi adını ya da çalışma alanı adını değiştirebileceği ilk ekran.
// Kayıt sayfası kullanıcıya "adı sonradan ayarlardan değiştirebilirsiniz"
// diyordu ama böyle bir ekran hiç yazılmamıştı.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateAccountAction } from './actions'

export function AccountForm({
  fullName,
  email,
  workspaceName,
  isOwner,
}: {
  fullName: string
  email: string | null
  workspaceName: string
  isOwner: boolean
}) {
  const [name, setName] = useState(fullName)
  const [workspace, setWorkspace] = useState(workspaceName)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const dirty = name !== fullName || workspace !== workspaceName

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => {
          const res = await updateAccountAction(name, workspace)
          if (res.error) {
            toast.error(res.error)
            return
          }
          toast.success('Hesap bilgileri güncellendi.')
          router.refresh()
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="account-name">Ad Soyad</Label>
        <Input
          id="account-name"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Bu ad öğrenci ve veli davetlerinde, raporlarda ve sol menüde görünür.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="account-email">E-posta</Label>
        {/* SALT OKUNUR: e-posta gerçek kimlik ve onu değiştirmek doğrulama
            akışı gerektiriyor. Yarım bir değişiklik, kullanıcının giriş
            yapamamasıyla sonuçlanır — o yüzden alan burada bilgi olarak
            duruyor, düzenlenebilir bir alan gibi görünmüyor. */}
        <Input id="account-email" value={email ?? '—'} readOnly disabled />
        <p className="text-xs text-muted-foreground">
          Giriş adresiniz. Değiştirmek için destek talebi açın.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="account-workspace">Çalışma alanı adı</Label>
        <Input
          id="account-workspace"
          value={workspace}
          maxLength={120}
          disabled={!isOwner}
          onChange={(e) => setWorkspace(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {isOwner
            ? 'Kurumunuzun ya da koçluk hizmetinizin adı.'
            : 'Çalışma alanı adını yalnız alanın sahibi değiştirebilir.'}
        </p>
      </div>

      <Button type="submit" size="sm" disabled={pending || !dirty}>
        {pending && <Loader2 className="animate-spin" />}
        Kaydet
      </Button>
    </form>
  )
}
