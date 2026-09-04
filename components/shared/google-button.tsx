'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { signInWithGoogleAction } from '@/app/(auth)/actions'

// GOOGLE İLE DEVAM ET.
//
// İkon inline SVG: Google'ın marka rengi dört parçalı ve `currentColor`
// ile boyanamaz. Uzak bir görsel yüklemek de olmaz — CSP dışı bir istek
// ve giriş ekranında gereksiz bir bekleme.

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

export function GoogleButton({ label = 'Google ile devam et' }: { label?: string }) {
  const [pending, startTransition] = useTransition()

  function start() {
    startTransition(async () => {
      // Başarılı olduğunda bu aksiyon yönlendirme yapar ve buraya
      // dönmez; yalnız hata durumunda bir sonuç gelir.
      const res = await signInWithGoogleAction()
      if (res?.error) toast.error(res.error)
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-2"
      disabled={pending}
      onClick={start}
    >
      <GoogleIcon />
      {pending ? 'Yönlendiriliyor…' : label}
    </Button>
  )
}
