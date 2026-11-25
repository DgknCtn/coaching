import 'server-only'

// GOOGLE CALENDAR — yalnız OKUMA (migration 157, tek yönlü model).
//
// Ek paket yok: OAuth ve Calendar REST uçları doğrudan fetch ile. Kapsam
// `calendar.readonly` (+ hesabın e-postasını göstermek için `email`).
// İz Calendar'a HİÇ yazmaz.
//
// Özellik, ortam değişkenleri tanımlanana kadar KAPALIDIR
// (calendarConfigured): bağla düğmesi görünmez, eşitleme çalışmaz.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const API = 'https://www.googleapis.com/calendar/v3'

export const CALENDAR_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.readonly']

export function calendarConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CALENDAR_CLIENT_ID &&
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET &&
    process.env.CALENDAR_TOKEN_KEY
  )
}

export function calendarRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/google/calendar/callback`
}

/** Anahtar geçersiz/iptal edildi → öğretmen yeniden bağlanmalı. */
export class GoogleReauthError extends Error {}

export function buildAuthUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? '',
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPES.join(' '),
    // Kalıcı anahtar (refresh token) için: offline + her bağlanışta onay.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${AUTH_URL}?${params.toString()}`
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? '',
      ...body,
    }),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    // invalid_grant: anahtar iptal edildi ya da (test modunda) 7 günlük
    // süresi doldu — öğretmen yeniden bağlanmalı.
    if (json.error === 'invalid_grant') throw new GoogleReauthError('Google bağlantısının süresi doldu ya da iptal edildi.')
    throw new Error(`Google token hatası: ${String(json.error ?? res.status)}`)
  }
  return json as { access_token: string; refresh_token?: string; expires_in?: number }
}

export async function exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }) {
  return tokenRequest({
    grant_type: 'authorization_code',
    code: input.code,
    code_verifier: input.codeVerifier,
    redirect_uri: input.redirectUri,
  })
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const json = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
  return json.access_token
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST', cache: 'no-store' }).catch(() => {})
}

async function api<T>(accessToken: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : `${API}${path}`)
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
  if (res.status === 401) throw new GoogleReauthError('Google erişimi reddedildi.')
  if (!res.ok) throw new Error(`Google Calendar hatası: ${res.status}`)
  return (await res.json()) as T
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const info = await api<{ email?: string }>(accessToken, USERINFO_URL).catch(() => ({ email: undefined }))
  return info.email ?? null
}

export interface GoogleCalendarListEntry {
  id: string
  summary: string
  primary?: boolean
  accessRole?: string
}

export async function listCalendars(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const res = await api<{ items?: GoogleCalendarListEntry[] }>(accessToken, '/users/me/calendarList', {
    minAccessRole: 'reader',
  })
  return res.items ?? []
}

/** Google'ın etkinlik yanıtından yalnız kullanılan alanlar. */
export interface GoogleEvent {
  id: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  summary?: string
  recurringEventId?: string
  originalStartTime?: { dateTime?: string; date?: string }
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: { email?: string; self?: boolean; organizer?: boolean; responseStatus?: string }[]
  hangoutLink?: string
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
}

/**
 * Penceredeki etkinlikler — tekrarlayan seri her tarih için ayrı örnek
 * (singleEvents=true) ve İPTAL edilen örnekler dahil (showDeleted=true):
 * iptal İz'de oturumu silmez, işaretler.
 */
export async function listEvents(
  accessToken: string,
  calendarId: string,
  window: { timeMin: Date; timeMax: Date }
): Promise<GoogleEvent[]> {
  const out: GoogleEvent[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 20; page++) {
    const res = await api<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        singleEvents: 'true',
        showDeleted: 'true',
        timeMin: window.timeMin.toISOString(),
        timeMax: window.timeMax.toISOString(),
        maxResults: '250',
        ...(pageToken ? { pageToken } : {}),
      }
    )
    out.push(...(res.items ?? []))
    if (!res.nextPageToken) break
    pageToken = res.nextPageToken
  }
  return out
}
