'use client'

// Öğrencinin video kaynakları (R4 §6). Sunucu bileşeni bir Server Action'ı
// doğrudan panele geçiremediği için ince bir istemci sarmalayıcı.

import type { BookMapBook } from '@/lib/book-map'
import { collectVideoResources, watchedKeys } from '@/lib/book-videos'
import { BookVideoPanel } from '@/components/shared/book-video-panel'
import { markVideoWatchedAction } from '../../actions'

interface Props {
  book: BookMapBook
  watchRows: { section_id: string | null }[]
}

export function StudentBookVideos({ book, watchRows }: Props) {
  const resources = collectVideoResources(book, watchedKeys(watchRows))

  return (
    <BookVideoPanel
      book={book}
      resources={resources}
      onMarkWatched={(assignmentId, sectionId) =>
        markVideoWatchedAction(assignmentId, sectionId)
      }
    />
  )
}
