'use client'

// Video kaynakları (R4 §6).
//
// Video, test/sayfa planının hesap birimi DEĞİLDİR: burada gösterilenlerin
// hiçbiri tempo matematiğine girmez. Öğrenci "İzledim" diyebilir, öğretmen
// onayı gerekmez. İzleme yüzdesi/süresi gibi metrikler bilinçli olarak
// tutulmaz — her sayfa/teste video eşlemek de yapılmaz.

import { useState, useTransition } from 'react'
import { Check, Video } from 'lucide-react'
import { toast } from 'sonner'
import type { BookMapBook } from '@/lib/book-map'
import { Button } from '@/components/ui/button'
import { Section } from '@/components/shared/section'

export interface VideoResource {
  /** Bölüm videosu ise bölüm id'si; kitap geneli ise null. */
  sectionId: string | null
  label: string
  url: string
  watched: boolean
}

interface Props {
  book: BookMapBook
  resources: VideoResource[]
  /** Öğrenci panelinde verilir; veli/öğretmen görünümünde boş bırakılır. */
  onMarkWatched?: (assignmentId: string, sectionId: string | null) => Promise<{ error?: string } | void>
}

export function BookVideoPanel({ book, resources, onMarkWatched }: Props) {
  if (resources.length === 0) return null

  return (
    <Section
      title="Video kaynakları"
      description="Bu kaynaklar plan temposuna dahil değildir."
      variant="card"
    >
      <ul className="divide-y">
        {resources.map((resource) => (
          <VideoRow
            key={resource.sectionId ?? 'book'}
            assignmentId={book.assignmentId}
            resource={resource}
            onMarkWatched={onMarkWatched}
          />
        ))}
      </ul>
    </Section>
  )
}

function VideoRow({
  assignmentId,
  resource,
  onMarkWatched,
}: {
  assignmentId: string
  resource: VideoResource
  onMarkWatched?: Props['onMarkWatched']
}) {
  const [watched, setWatched] = useState(resource.watched)
  const [isPending, startTransition] = useTransition()

  const mark = () => {
    startTransition(async () => {
      const result = await onMarkWatched?.(assignmentId, resource.sectionId)
      if (result && 'error' in result && result.error) {
        toast.error(result.error)
        return
      }
      setWatched(true)
      toast.success('İzledin olarak işaretlendi.')
    })
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <a
        href={resource.url}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 items-center gap-2 text-sm hover:underline"
      >
        <Video className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{resource.label}</span>
      </a>

      {/* İşaretleme yalnız öğrencinin yapabileceği bir eylem; onMarkWatched
          verilmeyen bağlamlarda (veli paneli) durum SALT OKUNUR gösterilir.
          Önceden veli hiçbir şey görmüyordu ve liste durumsuz kalıyordu. */}
      {onMarkWatched ? (
        watched ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-success-foreground">
            <Check className="size-3.5" />
            İzledim
          </span>
        ) : (
          <Button size="sm" variant="outline" disabled={isPending} onClick={mark}>
            İzledim
          </Button>
        )
      ) : (
        <span
          className={
            watched
              ? 'flex shrink-0 items-center gap-1.5 text-xs text-success-foreground'
              : 'shrink-0 text-xs text-muted-foreground'
          }
        >
          {watched && <Check className="size-3.5" />}
          {watched ? 'İzlendi' : 'Henüz izlenmedi'}
        </span>
      )}
    </li>
  )
}
