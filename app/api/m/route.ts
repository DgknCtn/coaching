import { NextResponse, type NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { marketingEventSchema } from '@/lib/marketing/events'

// PAZARLAMA OLAY UCU — Feature Showcase PRD §14 (migration 158).
//
// SERVİS İSTEMCİSİ NEDEN: bu uç OTURUMSUZ (ziyaretçi henüz kullanıcı
// değil). lib/supabase/service.ts kuralının istisnası tam bu: oturumsuz
// sunucu ucu. Tabloya anon yetkisi verilmez (proje kuralı); yazma yalnız
// buradan, beyaz listeli alanlarla olur.
//
// KİŞİSEL VERİ YOK: IP yalnız aşağıdaki hız sınırlayıcıda, tek yönlü
// özet olarak ve BELLEKTE tutulur; veritabanına hiçbir zaman yazılmaz.
//
// HIZ SINIRI: sunucu örneği başına bellek içi pencere. Kesin değildir
// (örnekler arasında paylaşılmaz) ama değeri düşük bir ölçüm ucu için
// yeterli: check_rate_limit (068) eylem listesini değiştirmek giriş ve
// kayıt korumasına dokunmak demekti.

const WINDOW_MS = 10 * 60_000
const MAX_PER_WINDOW = 120
const MAX_BODY_BYTES = 1024
const buckets = new Map<string, { start: number; count: number }>()

function limited(ip: string, now: number): boolean {
  const key = createHash('sha256').update(ip).digest('hex').slice(0, 16)
  const b = buckets.get(key)
  if (!b || now - b.start > WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 })
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now - v.start > WINDOW_MS) buckets.delete(k)
    }
    return false
  }
  b.count++
  return b.count > MAX_PER_WINDOW
}

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (limited(ip, Date.now())) return new NextResponse(null, { status: 429 })

  let body: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 })
    body = JSON.parse(text)
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  const parsed = marketingEventSchema.safeParse(body)
  if (!parsed.success) return new NextResponse(null, { status: 400 })

  const supabase = createServiceClient() as unknown as SupabaseClient
  const { error } = await supabase.from('marketing_events').insert(parsed.data)
  // Ölçüm hatası ziyaretçiye yansımaz; yalnız günlüğe.
  if (error) console.error('[marketing] olay yazılamadı:', error.code)
  return new NextResponse(null, { status: 204 })
}
