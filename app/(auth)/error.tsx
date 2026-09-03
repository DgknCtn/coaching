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
      source="auth-segment"
      title="Bu adım tamamlanamadı"
      description="Giriş ekranına dönüp tekrar deneyebilirsiniz."
    />
  )
}
