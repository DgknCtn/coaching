import 'server-only'
import { reportError } from '@/lib/observability'

// VERCEL AI GATEWAY — sunucu tarafı, tek çağrı noktası (canlıya alma Faz 6).
//
// NEDEN SDK DEĞİL, DÜZ fetch: AI SDK 7 Node 22 istiyor; yerel ortam ve
// testler daha eski Node'da da çalışmalı. Gateway OpenAI uyumlu bir uç
// sunuyor; tek bir POST yetiyor.
//
// AÇMA/KAPAMA: iki ortam değişkeni birlikte gerekir.
//   AI_GATEWAY_API_KEY      Vercel → AI Gateway → API Keys
//   AI_SUMMARIES_ENABLED=1  kill switch; kaldırılınca düğmeler kaybolur
// İsteğe bağlı: AI_SUMMARY_MODEL (varsayılan anthropic/claude-haiku-5-5).
// Bütçe sınırı Gateway panelinde ayrıca konur.

const ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions'
const DEFAULT_MODEL = 'anthropic/claude-haiku-5-5'

export function aiSummariesEnabled(): boolean {
  return process.env.AI_SUMMARIES_ENABLED === '1' && !!process.env.AI_GATEWAY_API_KEY
}

export async function generateText(input: {
  system: string
  prompt: string
  maxTokens?: number
}): Promise<{ text: string } | { error: string }> {
  const key = process.env.AI_GATEWAY_API_KEY
  if (!key) return { error: 'Yapay zekâ özetleri yapılandırılmamış.' }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.AI_SUMMARY_MODEL || DEFAULT_MODEL,
        max_tokens: input.maxTokens ?? 600,
        temperature: 0.4,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.prompt },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      reportError(new Error(`AI Gateway ${res.status}`), { scope: 'ai', message: await res.text() })
      return { error: 'Özet şu an oluşturulamadı. Biraz sonra tekrar deneyin.' }
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = body.choices?.[0]?.message?.content?.trim()
    if (!text) return { error: 'Özet boş döndü. Tekrar deneyin.' }
    return { text }
  } catch (error) {
    reportError(error, { scope: 'ai', message: 'AI Gateway çağrısı başarısız.' })
    return { error: 'Özet şu an oluşturulamadı. Biraz sonra tekrar deneyin.' }
  }
}
