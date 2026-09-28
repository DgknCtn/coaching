// E-POSTA ŞABLONLARI — saf (SaaS planı A2). Testli: tests/email-templates.test.ts
//
// Her ileti: ne oldu, ne yapmalı, TEK bağlantı, neden aldığın ve nasıl
// kapatacağın. Düz HTML (satır içi stil — e-posta istemcileri harici CSS
// okumaz) + düz metin sürümü (bazı istemciler ve spam filtreleri ister).
//
// Kullanıcıdan gelen her değer (ad, alan adı) kaçışlanır: adında `<` olan
// bir öğretmen iletinin yapısını bozamaz.

import { BRAND, absoluteUrl } from '@/lib/brand'
import type { ReminderKind } from '@/lib/reminders'

export interface EmailContent {
  subject: string
  html: string
  text: string
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' })

/** "30 Eylül" — İstanbul takvimiyle. */
export function formatDayTr(iso: string): string {
  return dateFmt.format(new Date(iso))
}

interface Layout {
  greetingName: string | null
  paragraphs: string[]
  cta: { label: string; path: string }
  /** Hizmet iletisi mi (kapatılabilir) yoksa işlem iletisi mi (makbuz). */
  optOut: boolean
}

function render(subject: string, l: Layout): EmailContent {
  const hello = l.greetingName ? `Merhaba ${l.greetingName},` : 'Merhaba,'
  const url = absoluteUrl(l.cta.path)
  const footer = l.optOut
    ? `Bu iletiyi ${BRAND.name} hesabınla ilgili olduğu için aldın. Hatırlatmaları Ayarlar sayfasından kapatabilirsin: ${absoluteUrl('/teacher/ayarlar')}`
    : `Bu iletiyi ${BRAND.name} hesabındaki bir işlem nedeniyle aldın.`

  const text = [hello, '', ...l.paragraphs.flatMap((p) => [p, '']), `${l.cta.label}: ${url}`, '', '—', footer].join('\n')

  const p = (s: string) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1f2328">${escapeHtml(s)}</p>`
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e6ea;border-radius:10px;padding:28px">
<p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#1f2328">${escapeHtml(BRAND.name)}</p>
${p(hello)}
${l.paragraphs.map(p).join('\n')}
<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1f2328;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:15px;font-weight:600">${escapeHtml(l.cta.label)}</a></p>
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6b7280">${escapeHtml(footer)}</p>
</div></body></html>`

  return { subject, html, text }
}

// ------------------------------------------------------------
// Deneme ve lisans hatırlatmaları
// ------------------------------------------------------------

export function reminderEmail(input: {
  kind: ReminderKind
  teacherName: string | null
  endsAt: string
}): EmailContent {
  const name = input.teacherName?.trim().split(/\s+/)[0] ?? null
  const day = formatDayTr(input.endsAt)
  const plan = { label: 'Planını seç', path: '/teacher/ayarlar/abonelik' }
  const renew = { label: 'Lisansını yenile', path: '/teacher/ayarlar/abonelik' }
  const keep = 'Verilerinin hiçbiri silinmez; plan aldığında kaldığın yerden devam edersin.'

  switch (input.kind) {
    case 'trial_3':
      return render(`${BRAND.name} denemen ${day} tarihinde bitiyor`, {
        greetingName: name,
        paragraphs: [`Deneme süren ${day} tarihinde bitiyor. Öğrencilerinin takibi kesintisiz sürsün istersen öğrenci sayına ve süreye göre planını şimdi seçebilirsin.`, keep],
        cta: plan,
        optOut: true,
      })
    case 'trial_1':
      return render(`${BRAND.name} denemen yarın bitiyor`, {
        greetingName: name,
        paragraphs: [`Deneme süren ${day} tarihinde, yani yarın bitiyor. Bittiğinde öğrenci ve veli ekranları da kapanır.`, keep],
        cta: plan,
        optOut: true,
      })
    case 'trial_ended':
      return render(`${BRAND.name} deneme süren doldu`, {
        greetingName: name,
        paragraphs: ['Deneme süren doldu ve çalışma alanın şu an erişime kapalı.', keep],
        cta: plan,
        optOut: true,
      })
    case 'license_7':
      return render(`${BRAND.name} lisansın ${day} tarihinde bitiyor`, {
        greetingName: name,
        paragraphs: [`Lisansın ${day} tarihinde bitiyor. Yenilediğinde yeni süre mevcut bitişin üstüne eklenir; bir gün bile kaybetmezsin.`],
        cta: renew,
        optOut: true,
      })
    case 'license_1':
      return render(`${BRAND.name} lisansın yarın bitiyor`, {
        greetingName: name,
        paragraphs: [`Lisansın ${day} tarihinde, yani yarın bitiyor. Bittiğinde öğrenci ve veli ekranları da kapanır.`, keep],
        cta: renew,
        optOut: true,
      })
    case 'license_ended':
      return render(`${BRAND.name} lisansının süresi doldu`, {
        greetingName: name,
        paragraphs: ['Lisansının süresi doldu ve çalışma alanın şu an erişime kapalı.', keep],
        cta: renew,
        optOut: true,
      })
  }
}
