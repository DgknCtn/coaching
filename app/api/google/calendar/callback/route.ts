import { NextResponse, type NextRequest } from 'next/server'
import { getTeacherContext } from '@/lib/workspace'
import { createClient } from '@/lib/supabase/server'
import { CalendarKeyError, encryptToken } from '@/lib/calendar/crypto'
import {
  calendarConfigured,
  calendarRedirectUri,
  exchangeCode,
  fetchUserEmail,
  GoogleReauthError,
} from '@/lib/google/calendar'
import { syncConnection } from '@/lib/calendar/sync'
import { siteUrl } from '@/lib/brand'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const OAUTH_COOKIE = 'iz_gcal_oauth'

// GOOGLE TAKVİMİ BAĞLA — dönüş (migration 157).
//
// `state` çerezdekiyle birebir eşleşmezse hiçbir şey yazılmaz. Kalıcı
// anahtar sunucuda şifrelenir ve öğretmenin KENDİ oturumuyla, kendi
// bağlantısına yazılır (save_calendar_connection). İlk eşitleme süre
// sınırlı denenir; düşerse bağlantı yine kurulmuştur.

export async function GET(request: NextRequest) {
  const { workspaceId } = await getTeacherContext()
  const settings = new URL('/teacher/ayarlar', siteUrl())
  const fail = (code: string) => {
    settings.searchParams.set('takvim', code)
    const res = NextResponse.redirect(settings)
    res.cookies.delete({ name: OAUTH_COOKIE, path: '/api/google/calendar' })
    return res
  }

  if (!calendarConfigured()) return fail('yapilandirilmadi')

  const params = request.nextUrl.searchParams
  if (params.get('error')) return fail('iptal')

  let saved: { state?: string; verifier?: string } = {}
  try {
    saved = JSON.parse(request.cookies.get(OAUTH_COOKIE)?.value ?? '{}')
  } catch {
    saved = {}
  }
  const code = params.get('code')
  if (!code || !saved.state || !saved.verifier || params.get('state') !== saved.state) {
    return fail('gecersiz')
  }

  try {
    const tokens = await exchangeCode({
      code,
      codeVerifier: saved.verifier,
      redirectUri: calendarRedirectUri(siteUrl()),
    })
    if (!tokens.refresh_token) return fail('anahtar_yok')
    // Google izinleri tek tek kutularla soruyor; takvim kutusu boş
    // bırakılırsa bağlantı kurulur ama hiçbir şey okunamaz (403).
    if (tokens.scope && !tokens.scope.split(' ').includes('https://www.googleapis.com/auth/calendar.readonly')) {
      return fail('izin_eksik')
    }
    const email = await fetchUserEmail(tokens.access_token)

    const supabase = await createClient()
    const { data: connectionId, error } = await supabase.rpc('save_calendar_connection', {
      p_workspace_id: workspaceId,
      p_google_email: email,
      p_refresh_token_enc: encryptToken(tokens.refresh_token),
    })
    if (error || !connectionId) return fail('kayit')

    await logAudit(supabase, {
      workspaceId,
      action: 'calendar.connect',
      entityType: 'workspace',
      entityId: workspaceId,
      detail: { email },
    })

    // İlk eşitleme: süre sınırlı; Google yavaşsa öğretmen beklemez.
    await Promise.race([
      syncConnection(supabase, connectionId as string).catch(() => null),
      new Promise(resolve => setTimeout(resolve, 8000)),
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[google-calendar] bağlanamadı:', message)
    // Hangi adımın düştüğü ekranda görünsün (sır içermez).
    if (error instanceof CalendarKeyError) return fail('sifreleme')
    if (/invalid_client|unauthorized_client/.test(message)) return fail('istemci')
    if (error instanceof GoogleReauthError || /invalid_grant/.test(message)) return fail('kod')
    return fail('hata')
  }

  settings.searchParams.set('takvim', 'baglandi')
  const res = NextResponse.redirect(settings)
  res.cookies.delete({ name: OAUTH_COOKIE, path: '/api/google/calendar' })
  return res
}
