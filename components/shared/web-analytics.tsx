'use client'

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next'

// VERCEL WEB ANALYTICS (canlıya alma, Faz 1.6).
//
// Çerez kullanmaz; pilot boyunca hangi ekranların gerçekten açıldığını
// ölçmek için. Betik aynı kökten (/_vercel/insights) yüklendiği için
// CSP'ye ek izin gerekmiyor.
//
// ADRESTEKİ KİMLİKLER MASKELENİR: panel adresleri öğrenci, kitap ve davet
// kimliği taşıyor (/teacher/students/<uuid>). Bunlar ölçüme gerekmiyor ve
// üçüncü bir tarafa gitmemeli; ekran türü (`/teacher/students/:id`) yeter.
// Sorgu dizesi de atılır (?sekme= dışında anlamlı bir şey taşımıyor ve
// davet/sıfırlama bağlantılarında jeton olabilir).

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const TOKEN = /\/invite\/[^/?#]+/g

export function maskAnalyticsUrl(raw: string): string {
  try {
    const url = new URL(raw)
    url.pathname = url.pathname.replace(UUID, ':id').replace(TOKEN, '/invite/:token')
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return raw
  }
}

function beforeSend(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: maskAnalyticsUrl(event.url) }
}

export function WebAnalytics() {
  return <Analytics beforeSend={beforeSend} />
}
