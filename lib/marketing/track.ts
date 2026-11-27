'use client'

import { deviceFromWidth, type MarketingEventPayload } from './events'

// İstemci tarafı olay gönderimi — sendBeacon, hata sessiz. "Do Not Track"
// açıksa hiçbir şey gönderilmez. Kişisel veri eklenmez (events.ts).

function optedOut(): boolean {
  if (typeof navigator === 'undefined') return true
  const dnt = (navigator as Navigator & { doNotTrack?: string }).doNotTrack
  return dnt === '1' || dnt === 'yes'
}

export function track(payload: Omit<MarketingEventPayload, 'device'>): void {
  try {
    if (optedOut()) return
    const body = JSON.stringify({ ...payload, device: deviceFromWidth(window.innerWidth) })
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/m', new Blob([body], { type: 'application/json' }))
    } else {
      void fetch('/api/m', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } })
    }
  } catch {
    // Ölçüm hiçbir zaman sayfayı bozmaz.
  }
}
