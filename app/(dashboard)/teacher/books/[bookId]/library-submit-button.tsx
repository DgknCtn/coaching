'use client'

// KİTABI KÜTÜPHANEYE ÖNER (069).
//
// Koçun kendi kurduğu iyi bir kaynak — doğru bölümlenmiş, aralıkları
// girilmiş — bugün yalnız onun havuzunda kalıyor. Öneri, o emeği ortak
// kütüphaneye taşımanın yoludur; yayına girmesi platform yöneticisinin
// onayına bağlıdır.
//
// KİTAP TAŞINMAZ: öneri yalnız bir işarettir, koçun öğrencileri kaynağı
// kullanmaya devam eder.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { submitBookToLibraryAction } from '../actions'

export function LibrarySubmitButton({
  bookId,
  libraryStatus,
  reviewNote,
}: {
  bookId: string
  libraryStatus: string | null
  reviewNote: string | null
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  if (libraryStatus === 'pending') {
    return <Badge variant="info">Kütüphane onayı bekliyor</Badge>
  }

  if (libraryStatus === 'approved') {
    return <Badge variant="success">Kütüphanede yayında</Badge>
  }

  return (
    <div className="flex items-center gap-2">
      {/* Reddedilmiş öneri sessizce kaybolmaz: koç gerekçeyi görüp
          düzelttikten sonra tekrar önerebilir. */}
      {libraryStatus === 'rejected' && (
        <Badge variant="warning" title={reviewNote ?? undefined}>
          {reviewNote ? `Reddedildi: ${reviewNote}` : 'Öneri reddedildi'}
        </Badge>
      )}

      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await submitBookToLibraryAction(bookId)
            if (result.error) {
              toast.error(result.error)
              return
            }
            toast.success('Kaynak kütüphaneye önerildi. Onaydan sonra yayına girecek.')
            router.refresh()
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Share2 className="size-4" />}
        Kütüphaneye öner
      </Button>
    </div>
  )
}
