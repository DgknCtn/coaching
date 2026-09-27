'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { logoutAction } from '@/app/(auth)/actions'

/**
 * "Başka hesapla gir": oturumu kapatır ve AYNI davet linkine döner.
 * Yanlış hesapla girmiş davetlinin tek çıkış yolu; /login'e atılsaydı
 * linki yeniden bulması gerekirdi.
 */
export function SwitchAccountButton({
  returnTo,
  primary = false,
}: {
  returnTo: string
  /** Tek eylem olduğunda (yanlış hesap) birincil düğme olarak çizilir. */
  primary?: boolean
}) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant={primary ? 'default' : 'outline'}
      size={primary ? 'lg' : 'default'}
      className="w-full"
      disabled={pending}
      onClick={() => startTransition(async () => void (await logoutAction(returnTo)))}
    >
      {pending ? 'Çıkış yapılıyor…' : 'Başka hesapla gir'}
    </Button>
  )
}
