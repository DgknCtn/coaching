'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { track } from '@/lib/marketing/track'
import type { MarketingEventPayload } from '@/lib/marketing/events'

// Ölçüm yardımcıları (PRD §14). Hepsi istemci adacığı; sayfanın geri kalanı
// sunucu bileşeni olarak kalır.

type Payload = Omit<MarketingEventPayload, 'device'>

/** Tıklanınca olay gönderen bağlantı; davranışı sıradan Link ile aynı. */
export function TrackedLink({
  payload,
  ...props
}: React.ComponentProps<typeof Link> & { payload: Payload }) {
  return (
    <Link
      {...props}
      onClick={e => {
        track(payload)
        props.onClick?.(e)
      }}
    />
  )
}

/** Sayfa açılışında bir kez. */
export function TrackOnMount({ payload }: { payload: Payload }) {
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    track(payload)
  }, [payload])
  return null
}

/** Görünür olduğunda bir kez (bölüm/kategori görüntüleme). */
export function TrackInView({ payload, className }: { payload: Payload; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          track(payload)
          io.disconnect()
        }
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [payload])
  return <div ref={ref} aria-hidden className={className ?? 'h-px w-full'} />
}
