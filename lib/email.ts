import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { reportError } from '@/lib/observability'
import type { EmailContent } from '@/lib/email-templates'

// E-POSTA GÖNDERİMİ (SaaS planı A2).
//
// ============================================================
// İKİ SAĞLAYICI, BİR KURAL
//
//   1. RESEND_API_KEY + EMAIL_FROM        → Resend HTTP API (kendi alan adı).
//   2. SMTP_HOST/USER/PASS + EMAIL_FROM   → SMTP (pilot: Gmail + uygulama
//      şifresi — alan adı olmadan, ücretsiz, ~500 ileti/gün).
//   3. İkisi de yoksa                     → gönderilmez, 'skipped' kaydedilir.
//
// Karar (28 Eylül 2026): ilk ücretli müşteriye kadar 0 TL; pilot Gmail
// SMTP ile yürür, alan adı alınınca RESEND_API_KEY eklenir ve kod
// değişmeden Resend'e geçilir (Resend önce gelir).
//
// 'skipped' tekillik anahtarını SERBEST bırakır (131: kısmi indeks yalnız
// pending/sent): yapılandırma geldiği gün bekleyen hatırlatmalar ertesi
// çalışmada gider.
//
// ÇİFT GÖNDERİM: email_log'a önce 'pending' satır yazılır; aynı anahtarla
// ikinci çağrı benzersizlik ihlaline (23505) düşer. Resend'de ayrıca
// Idempotency-Key gider; SMTP'de böyle bir başlık yok, koruma email_log.
//
// Başarısız gönderim 'failed' olur, anahtarı serbest bırakır ve ertesi gün
// yeniden denenir. Hata metni değil kodu/kısa özeti yazılır.
// ============================================================

export type SendStatus = 'sent' | 'duplicate' | 'skipped' | 'failed'
export type EmailProvider = 'resend' | 'smtp' | null

export interface SendInput {
  kind: string
  dedupeKey: string
  to: string
  profileId?: string | null
  workspaceId?: string | null
  content: EmailContent
}

const RESEND_URL = 'https://api.resend.com/emails'

const env = (k: string) => process.env[k]?.trim() || ''

export function emailProvider(): EmailProvider {
  if (!env('EMAIL_FROM')) return null
  if (env('RESEND_API_KEY')) return 'resend'
  if (env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS')) return 'smtp'
  return null
}

export function emailConfigured(): boolean {
  return emailProvider() !== null
}

type Delivery = { ok: true; providerId?: string } | { ok: false; error: string }

async function viaResend(input: SendInput): Promise<Delivery> {
  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.dedupeKey.slice(0, 256),
    },
    body: JSON.stringify({
      from: env('EMAIL_FROM'),
      to: [input.to],
      subject: input.content.subject,
      html: input.content.html,
      text: input.content.text,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { name?: string } | null
    return { ok: false, error: `http_${response.status}${body?.name ? `:${body.name}` : ''}` }
  }
  const body = (await response.json().catch(() => null)) as { id?: string } | null
  return { ok: true, providerId: body?.id }
}

async function viaSmtp(input: SendInput): Promise<Delivery> {
  // Yalnız bu yolda yüklenir: Resend kullanılırken paket hiç açılmaz.
  const nodemailer = await import('nodemailer')
  const port = Number(env('SMTP_PORT') || '465')
  const transport = nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port,
    secure: port === 465,
    auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
    connectionTimeout: 10_000,
    socketTimeout: 10_000,
  })
  const info = await transport.sendMail({
    from: env('EMAIL_FROM'),
    to: input.to,
    subject: input.content.subject,
    html: input.content.html,
    text: input.content.text,
  })
  return { ok: true, providerId: info.messageId }
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

  const provider = emailProvider()
  if (!provider) {
    await finish('skipped', { error: 'not_configured' })
    return 'skipped'
  }

  try {
    const result = provider === 'resend' ? await viaResend(input) : await viaSmtp(input)
    if (!result.ok) {
      await finish('failed', { error: `${provider}:${result.error}`.slice(0, 500) })
      return 'failed'
    }
    await finish('sent', { provider_id: result.providerId })
    return 'sent'
  } catch (error) {
    const code =
      (error as { code?: string })?.code ?? (error instanceof Error ? error.name : 'error')
    await finish('failed', { error: `${provider}:${code}`.slice(0, 500) })
    reportError(error, { source: 'email.send', kind: input.kind, provider })
    return 'failed'
  }
}
