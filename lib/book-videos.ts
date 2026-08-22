// Kitabın video kaynaklarını tek yerde toplar (R4 §6).
//
// video_mode: 'none' | 'book' | 'section'. Kitap genelinde tek bir bağlantı
// (kanal / oynatma listesi) ya da bölüm başına bir bağlantı olabilir. Her
// sayfa/test için video eşleştirmesi YAPILMAZ.

import type { BookMapBook } from '@/lib/book-map'
import type { VideoResource } from '@/components/shared/book-video-panel'

export function collectVideoResources(
  book: BookMapBook,
  watchedSectionKeys: Set<string>
): VideoResource[] {
  if (book.videoMode === 'none') return []

  if (book.videoMode === 'book') {
    if (!book.videoUrl) return []
    return [
      {
        sectionId: null,
        label: `${book.title} — konu anlatım videoları`,
        url: book.videoUrl,
        watched: watchedSectionKeys.has('book'),
      },
    ]
  }

  return book.sections
    .filter((section) => section.videoUrl)
    .map((section) => ({
      sectionId: section.id,
      label: `${section.title} — konu anlatım videoları`,
      url: section.videoUrl as string,
      watched: watchedSectionKeys.has(section.id),
    }))
}

/** video_watch_marks satırlarını panelin beklediği anahtar kümesine çevirir. */
export function watchedKeys(rows: { section_id: string | null }[]): Set<string> {
  return new Set(rows.map((r) => r.section_id ?? 'book'))
}
