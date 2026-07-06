import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Uptime izleme / load balancer sağlık kontrolü için hafif endpoint.
// Kimlik doğrulama gerektirmez, gizli bilgi döndürmez.
export function GET() {
  return NextResponse.json({ status: 'ok', time: new Date().toISOString() })
}
