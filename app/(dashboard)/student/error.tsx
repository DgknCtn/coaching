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
      source="student-segment"
      title="Bu sayfa yüklenemedi"
      description="Tekrar deneyebilirsin. Sorun sürerse öğretmenine haber ver."
    />
  )
}
