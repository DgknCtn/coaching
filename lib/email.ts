import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { reportError } from '@/lib/observability'
import type { EmailContent } from '@/lib/email-templates'

// E-POSTA GÖNDERİMİ (SaaS planı A2) — Resend HTTP API, SDK yok.
//
// ============================================================
// YAPILANDIRMA YOKKEN SESSİZ, AMA İZLİ
//
// RESEND_API_KEY ya da EMAIL_FROM tanımlı değilse hiçbir şey gönderilmez;
// email_log'a 'skipped' düşer. 'skipped' tekillik anahtarını SERBEST
// bırakır (131: kısmi indeks yalnız pending/sent), yani yapılandırma
// geldiği gün bekleyen hatırlatmalar ertesi çalışmada gider.
//
// ÇİFT GÖNDERİM İKİ KATTA ÖNLENİR:
//   1. email_log'a önce 'pending' satır yazılır; aynı anahtarla ikinci
//      çağrı benzersizlik ihlaline (23505) düşer ve gönderim olmaz.
//   2. Resend'e Idempotency-Key olarak aynı anahtar gider: ağ hatasından
//      sonra yeniden deneme sağlayıcıda da tek ileti üretir.
//
// Başarısız gönderim 'failed' olur ve anahtarı serbest bırakır: ertesi
// gün yeniden denenir. Hata metni değil kodu/kısa özeti yazılır.
// ============================================================

export type SendStatus = 'sent' | 'duplicate' | 'skipped' | 'failed'

export interface SendInput {
  kind: string
  dedupeKey: string
  to: string
  profileId?: string | null
  workspaceId?: string | null
  content: EmailContent
}

const RESEND_URL = 'https://api.resend.com/emails'

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim())
}

export async function sendEmail(input: SendInput): Promise<SendStatus> {
  const supabase = createServiceClient() as unknown as SupabaseClient

  const { data: row, error: insertError } = await supabase
    .from('email_log')
    .insert({
      kind: input.kind,
      dedupe_key: input.dedupeKey,
      recipient: input.to,
      profile_id: input.profileId ?? null,
      workspace_id: input.workspaceId ?? null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError) {
    if (insertError.code === '23505') return 'duplicate'
    reportError(insertError, { source: 'email.log_insert', kind: input.kind })
    return 'failed'
  }

  const id = (row as { id: string }).id
  const finish = async (status: 'sent' | 'failed' | 'skipped', extra: { provider_id?: string; error?: string } = {}) => {
    const { error } = await supabase
      .from('email_log')
      .update({ status, ...extra, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) reportError(error, { source: 'email.log_update', kind: input.kind })
  }

  if (!emailConfigured()) {
    await finish('skipped', { error: 'not_configured' })
    return 'skipped'
  }

  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.dedupeKey.slice(0, 256),
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM!.trim(),
        to: [input.to],
        subject: input.content.subject,
        html: input.content.html,
        text: input.content.text,
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { name?: string } | null
      await finish('failed', { error: `http_${response.status}${body?.name ? `:${body.name}` : ''}`.slice(0, 500) })
      return 'failed'
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null
    await finish('sent', { provider_id: body?.id ?? undefined })
    return 'sent'
  } catch (error) {
    await finish('failed', { error: (error instanceof Error ? error.name : 'error').slice(0, 500) })
    reportError(error, { source: 'email.send', kind: input.kind })
    return 'failed'
  }
}
