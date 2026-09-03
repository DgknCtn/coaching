'use client'

import { SegmentError } from '@/components/shared/segment-error'

export default function Boundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SegmentError
      error={error}
      reset={reset}
      source="invite-segment"
      title="Davet sayfası yüklenemedi"
      description="Bağlantıyı tekrar açmayı deneyin. Sorun sürerse sizi davet eden öğretmenden yeni bir bağlantı isteyin."
    />
  )
}
