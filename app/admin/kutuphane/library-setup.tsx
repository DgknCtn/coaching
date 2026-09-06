'use client'

// KÜTÜPHANE ALANI KURULUMU (069).
//
// Kütüphane, `is_library` bayraklı tek bir çalışma alanıdır. Onu elle SQL
// çalıştırarak açmak, özelliğin kullanılabilir olmasını bir dağıtım adımına
// bağlamak olurdu; yönetici buradan bir kez basar.
//
// KUTUPHANEYE KİTAP GİRİŞİ BURADA DEĞİL: alan kurulduktan sonra yönetici
// çalışma alanı seçicisinden "Kaynak Kütüphanesi"ne geçer ve kitabı olağan
// kitap formu / toplu içe aktarma ile ekler. İkinci bir kitap giriş ekranı
// yazmak, aynı formun iki sürümünü bakmak demekti.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Library, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Section } from '@/components/shared/section'
import { ensureLibraryWorkspaceAction } from './actions'

export function LibrarySetup({ libraryWorkspaceId }: { libraryWorkspaceId: string | null }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  if (libraryWorkspaceId) {
    return (
      <Section variant="card" contentClassName="px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Kütüphane çalışma alanı hazır. Kaynak eklemek için üst menüden{' '}
          <span className="font-medium text-foreground">Kaynak Kütüphanesi</span> alanına
          geçip kitap havuzunu kullan.
        </p>
      </Section>
    )
  }

  return (
    <Section variant="card" contentClassName="flex flex-wrap items-center gap-3 px-4 py-3">
      <Library className="size-4 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Kütüphane çalışma alanı henüz kurulmadı. Kurulana kadar koçlar kütüphaneyi boş görür.
      </p>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await ensureLibraryWorkspaceAction()
            if (res.error) {
              toast.error(res.error)
              return
            }
            toast.success('Kütüphane çalışma alanı kuruldu.')
            router.refresh()
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Library className="size-3.5" />}
        Kütüphaneyi kur
      </Button>
    </Section>
  )
}
