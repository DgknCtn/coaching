'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { logoutAction } from '@/app/(auth)/actions'

/**
 * Erişim engeli ekranının çıkış yolu.
 *
 * ÖNCEDEN YALNIZ "/login'e git" BAĞLANTISI VARDI ve bu yetmiyordu:
 * oturum açık kaldığı için middleware kullanıcıyı /login'den hemen geri
 * gönderiyordu. Yani ekrandaki tek çıkış düğmesi hiçbir yere
 * çıkarmıyordu — kullanıcının elinde tarayıcı çerezlerini temizlemekten
 * başka seçenek kalmıyordu (rapor bulgusu 3).
 *
 * Gerçek çözüm oturumu KAPATMAK; logoutAction bunu yapıp /login'e
 * yönlendiriyor ve orada artık oturum olmadığı için geri atılmıyor.
 */
export function SignOutLink() {
  const [pending, startTransition] = useTransition()

  return (
    <p className="text-center text-sm text-muted-foreground">
      Farklı bir hesapla devam etmek için{' '}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => void (await logoutAction()))}
        className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60"
      >
        {pending ? 'çıkış yapılıyor…' : 'çıkış yapın'}
      </button>
      {' · '}
      <Link href="/" className="underline-offset-4 hover:underline">
        Ana sayfa
      </Link>
    </p>
  )
}
