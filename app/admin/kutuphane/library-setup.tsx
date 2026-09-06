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
import { ArrowRightLeft, Library, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Section } from '@/components/shared/section'
import { BookPoolImport } from '@/components/shared/book-pool-import'
import { switchWorkspaceAction } from '@/app/(dashboard)/workspace-actions'
import { ensureLibraryWorkspaceAction, importLibraryBackupAction } from './actions'

export function LibrarySetup({
  libraryWorkspaceId,
  bookCount,
}: {
  libraryWorkspaceId: string | null
  bookCount: number
}) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  if (libraryWorkspaceId) {
    return (
      <Section
        variant="card"
        contentClassName="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      >
        <div className="min-w-0">
          <p className="text-sm">
            {bookCount === 0
              ? 'Kütüphane hazır ama boş — koçlar henüz hiçbir kaynak görmüyor.'
              : `Kütüphanede ${bookCount} kaynak yayında.`}
          </p>
          {/* İçe aktarma ANA YOL; tek tek girmek isteyen için alan
              değiştirme yolu duruyor ama artık zorunlu değil. */}
          <p className="mt-1 text-xs text-muted-foreground">
            &quot;Yedek al&quot; ile indirdiğin .json dosyasını buradan aktarabilir ya da
            üst menüden <span className="font-medium text-foreground">Kaynak Kütüphanesi</span>{' '}
            alanına geçip kitapları tek tek girebilirsin.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <BookPoolImport
            action={importLibraryBackupAction}
            targetLocative="kütüphanede"
            targetDative="kütüphaneye"
            triggerLabel="Yedekten aktar"
          />

          {/* KÜTÜPHANEYE TEK GİRİŞ YOLU BURASI.
              Kütüphane alanı sol menüdeki alan seçicisinde bilinçli olarak
              gizli: bir kiracı değil, platform altyapısı. Kitapları tek tek
              girmek isteyen yönetici oraya buradan geçer. */}
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await switchWorkspaceAction(libraryWorkspaceId)
                if (res?.error) {
                  toast.error(res.error)
                  return
                }
                router.push('/teacher/books')
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <ArrowRightLeft className="size-3.5" />}
            Kütüphane alanına geç
          </Button>
        </div>
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
