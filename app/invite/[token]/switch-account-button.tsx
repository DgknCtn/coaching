'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { logoutAction } from '@/app/(auth)/actions'

/**
 * "Başka hesapla gir": oturumu kapatır ve AYNI davet linkine döner.
 * Yanlış hesapla girmiş davetlinin tek çıkış yolu; /login'e atılsaydı
 * linki yeniden bulması gerekirdi.
 */
export function SwitchAccountButton({ returnTo }: { returnTo: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={pending}
      onClick={() => startTransition(async () => void (await logoutAction(returnTo)))}
    >
      {pending ? 'Çıkış yapılıyor…' : 'Başka hesapla gir'}
    </Button>
  )
}
