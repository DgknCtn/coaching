import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Uptime izleme / load balancer sağlık kontrolü.
// Kimlik doğrulama gerektirmez, gizli bilgi döndürmez.
//
// VERİTABANINA GERÇEKTEN BAKAR. Önceden sabit bir {status:'ok'} dönüyordu:
// Supabase tamamen düşse bile yeşil kalıyor, yani alarm görevini hiç
// yapmıyordu. Kör bir sağlık kontrolü, olmamasından daha kötüdür — çünkü
// izleyen kişiye yanlış bir güven verir.
//
// SORGU NEDEN BU: `students` üzerinde HEAD sayımı — satır GÖVDESİ
// dönmez, yalnız sayı.
//
// Önce kilitli bir tablo (`rate_limit_counters`) yoklanıyordu; yanlıştı.
// O tabloya erişim kapalı olduğu için sağlıklı durumda bile HATA dönüyor
// ve kontrol, izin hatasının kodunu tahmin etmeye dayanıyordu — kırılgan
// ve nitekim ilk denemede "degraded" verdi.
//
// Doğru yoklama, sağlıklı durumda HATASIZ dönen bir sorgudur. `students`
// okumaya açıktır; oturumsuz çağrıda RLS satırları süzer ve sonuç boş
// gelir. Yani: hata yoksa veritabanı, PostgREST ve RLS ayakta demektir.
// Kiracı verisi görünmez, maliyet tablo büyüklüğünden bağımsızdır.

const TIMEOUT_MS = 3000

export async function GET() {
  const startedAt = Date.now()

  try {
    const supabase = await createClient()

    // Veritabanı yanıt vermiyorsa istek asılı kalmamalı: sağlık kontrolünün
    // kendisi zaman aşımına uğramalı ki izleyici "yavaş" değil "arızalı"
    // sinyali alsın.
    const probe = supabase.from('students').select('id', { head: true })

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('database timeout')), TIMEOUT_MS)
    )

    const { error } = (await Promise.race([probe, timeout])) as { error: unknown }

    if (error) {
      return NextResponse.json(
        {
          status: 'degraded',
          database: 'error',
          latencyMs: Date.now() - startedAt,
          time: new Date().toISOString(),
        },
        { status: 503 }
      )
    }

    return NextResponse.json({
      status: 'ok',
      database: 'ok',
      latencyMs: Date.now() - startedAt,
      time: new Date().toISOString(),
    })
  } catch {
    // Hata ayrıntısı DÖNDÜRÜLMEZ: sağlık ucu kimlik doğrulaması olmadan
    // erişilebilir, iç hata mesajı sızdırmamalı.
    return NextResponse.json(
      {
        status: 'down',
        database: 'unreachable',
        latencyMs: Date.now() - startedAt,
        time: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
