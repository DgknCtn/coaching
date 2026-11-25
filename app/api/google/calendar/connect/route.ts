import { NextResponse, type NextRequest } from 'next/server'
import { createHash, randomBytes } from 'node:crypto'
import { getTeacherContext } from '@/lib/workspace'
import { buildAuthUrl, calendarConfigured, calendarRedirectUri } from '@/lib/google/calendar'
import { siteUrl } from '@/lib/brand'

export const dynamic = 'force-dynamic'

// GOOGLE TAKVİMİ BAĞLA — OAuth başlangıcı (migration 157).
//
// Tek kullanımlık `state` (CSRF) ve PKCE doğrulayıcısı HttpOnly çerezde,
// yalnız callback yoluna ve 10 dakikalığına. Öğretmen kendi Google
// hesabını bağlar; Supabase'in Google girişinden AYRIDIR (o akış Calendar
// izni ve kalıcı anahtar saklamaz).

const OAUTH_COOKIE = 'iz_gcal_oauth'

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function GET(request: NextRequest) {
  await getTeacherContext()
  const settings = new URL('/teacher/ayarlar', siteUrl())
  if (!calendarConfigured()) {
    settings.searchParams.set('takvim', 'yapilandirilmadi')
    return NextResponse.redirect(settings)
  }

  const state = base64url(randomBytes(24))
  const verifier = base64url(randomBytes(48))
  const challenge = base64url(createHash('sha256').update(verifier).digest())

  const response = NextResponse.redirect(
    buildAuthUrl({ state, codeChallenge: challenge, redirectUri: calendarRedirectUri(siteUrl()) })
  )
  response.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier }), {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/api/google/calendar',
    maxAge: 600,
  })
  return response
}
