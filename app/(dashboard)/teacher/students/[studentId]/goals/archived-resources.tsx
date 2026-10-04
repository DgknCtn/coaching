'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ChevronDown, ChevronRight, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { assignmentCleanupAction } from '../books/[bookId]/target-actions'

// Arşivlenen kaynaklar (M1.0-01 §1.2).
//
// Arşivlenen kaynak aktif Kaynak Planından ve yeni ödev seçiminden çıkar;
// geçmiş haftalarda ve raporlarda tarihsel veri olarak kalır. Burası tek
// geri dönüş noktası: aynı kitabı yeniden atamak dönem tekilliğine takılır.

export interface ArchivedResource {
  assignmentId: string
  bookId: string
  title: string
}

export function ArchivedResources({
  studentId,
  items,
}: {
  studentId: string
  items: ArchivedResource[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (items.length === 0) return null

  function restore(item: ArchivedResource) {
    setBusyId(item.assignmentId)
    startTransition(async () => {
      const result = await assignmentCleanupAction(
        studentId,
        item.bookId,
        item.assignmentId,
        'unarchive'
      )
      setBusyId(null)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success(`${item.title} aktif plana geri alındı.`)
      router.refresh()
    })
  }

  return (
    <section className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm"
      >
        <span className="flex items-center gap-2 font-medium">
          <Archive className="size-4 text-muted-foreground" />
          Arşivlenen kaynaklar
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {items.length} kaynak
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </span>
      </button>

      {open && (
        <ul className="divide-y border-t">
          {items.map(item => (
            <li
              key={item.assignmentId}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.title}</span>
                <span className="text-muted-foreground">
                  Geçmiş çalışmalar ve ilerleme korunuyor
                </span>
              </span>
              <Button
                size="xs"
                variant="outline"
                onClick={() => restore(item)}
                disabled={busyId !== null}
              >
                {busyId === item.assignmentId ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RotateCcw />
                )}
                Geri al
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
