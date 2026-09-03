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
      source="teacher-segment"
      title="Bu bölüm yüklenemedi"
      description="Sorun bu ekranla sınırlı. Tekrar deneyebilir ya da menüden başka bir sayfaya geçebilirsiniz."
    />
  )
}
