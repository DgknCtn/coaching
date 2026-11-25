import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@/lib/calendar/crypto'
import {
  calendarConfigured,
  GoogleReauthError,
  listEvents,
  refreshAccessToken,
} from '@/lib/google/calendar'
import { matchEvent, normalizeEvent, syncWindow, type MatchContext } from '@/lib/calendar/match'

// CALENDAR → İZ EŞİTLEME (migration 157, tek yönlü).
//
// İstemci kimin? Öğretmen tetiklediğinde (sayfa açılışı, "Şimdi eşitle")
// KENDİ oturumu; günlük yedek işte (CRON_SECRET) service_role. RPC'ler iki
// çağıranı da kabul eder (_calendar_caller_ok) — servis istemcisi kullanıcı
// yollarına sızmaz (lib/supabase/service.ts kuralı).
//
// Her örnek tek kapıdan (apply_calendar_event) geçer; idempotent: aynı
// eşitleme iki kez çalışsa da tek bağ, tek oturum.

export interface SyncSummary {
  ok: boolean
  events: number
  created: number
  adopted: number
  moved: number
  cancelled: number
  unmatched: number
  missing: number
  error?: string
  needsReauth?: boolean
}

const STALE_MS = 5 * 60_000
/** İstemci ile veritabanı saati arasındaki kaymaya pay (yanlış "karşılığı yok" olmasın). */
const CLOCK_MARGIN_MS = 2 * 60_000

async function loadContext(
  supabase: SupabaseClient,
  workspaceId: string,
  connectionId: string
): Promise<MatchContext> {
  const [matchesRes, studentsRes, parentsRes, servicesRes] = await Promise.all([
    supabase
      .from('calendar_series_matches')
      .select('series_key, student_id, service_id, ignored')
      .eq('connection_id', connectionId),
    supabase.from('students').select('id, email').eq('workspace_id', workspaceId).eq('status', 'active'),
    supabase
      .from('parent_student_links')
      .select('student_id, profiles(email)')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active'),
    supabase
      .from('student_services')
      .select('id, student_id')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .eq('participation', 'birebir'),
  ])

  const savedMatches: MatchContext['savedMatches'] = new Map()
  for (const m of (matchesRes.data ?? []) as {
    series_key: string
    student_id: string | null
    service_id: string | null
    ignored: boolean
  }[]) {
    if (m.ignored) savedMatches.set(m.series_key, { ignored: true })
    else if (m.student_id && m.service_id) savedMatches.set(m.series_key, { studentId: m.student_id, serviceId: m.service_id })
  }

  const studentsByEmail: MatchContext['studentsByEmail'] = new Map()
  const add = (email: string | null | undefined, studentId: string) => {
    const key = email?.trim().toLocaleLowerCase('en')
    if (!key) return
    const list = studentsByEmail.get(key) ?? []
    if (!list.includes(studentId)) list.push(studentId)
    studentsByEmail.set(key, list)
  }
  for (const s of (studentsRes.data ?? []) as { id: string; email: string | null }[]) add(s.email, s.id)
  for (const p of (parentsRes.data ?? []) as unknown as {
    student_id: string
    profiles: { email: string | null } | { email: string | null }[] | null
  }[]) {
    const prof = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
    add(prof?.email, p.student_id)
  }

  const birebirServicesByStudent: MatchContext['birebirServicesByStudent'] = new Map()
  for (const sv of (servicesRes.data ?? []) as { id: string; student_id: string }[]) {
    const list = birebirServicesByStudent.get(sv.student_id) ?? []
    list.push(sv.id)
    birebirServicesByStudent.set(sv.student_id, list)
  }

  return { savedMatches, studentsByEmail, birebirServicesByStudent }
}

export async function syncConnection(
  supabase: SupabaseClient,
  connectionId: string,
  now: Date = new Date()
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    ok: false,
    events: 0,
    created: 0,
    adopted: 0,
    moved: 0,
    cancelled: 0,
    unmatched: 0,
    missing: 0,
  }
  if (!calendarConfigured()) return { ...summary, error: 'Google Calendar yapılandırılmamış.' }

  const { data: conn } = await supabase
    .from('calendar_connections')
    .select('id, workspace_id, calendar_ids, status')
    .eq('id', connectionId)
    .maybeSingle()
  if (!conn) return { ...summary, error: 'Bağlantı bulunamadı.' }

  const syncStarted = new Date(now.getTime() - CLOCK_MARGIN_MS)
  const window = syncWindow(now)

  try {
    const { data: secret, error: secretError } = await supabase.rpc('get_calendar_secret', {
      p_connection_id: connectionId,
    })
    if (secretError || !secret) throw new Error('Bağlantı anahtarı okunamadı.')
    const accessToken = await refreshAccessToken(decryptToken(secret as string))

    const ctx = await loadContext(supabase, conn.workspace_id as string, connectionId)

    for (const calendarId of (conn.calendar_ids as string[]) ?? ['primary']) {
      const raw = await listEvents(accessToken, calendarId, window)
      const events = raw.map(e => normalizeEvent(e, calendarId)).filter((e): e is NonNullable<typeof e> => e !== null)
      summary.events += events.length

      // Küçük gruplar hâlinde: yüzlerce etkinlikte bile bağlantı havuzunu boğmaz.
      for (let i = 0; i < events.length; i += 10) {
        const batch = events.slice(i, i + 10)
        const results = await Promise.all(
          batch.map(event => {
            const match = event.status === 'cancelled' ? null : matchEvent(event, ctx)
            return supabase.rpc('apply_calendar_event', {
              p_connection_id: connectionId,
              p_event: {
                calendar_id: event.calendarId,
                event_id: event.eventId,
                recurring_event_id: event.recurringEventId,
                series_key: event.seriesKey,
                original_start: event.originalStart,
                start: event.start,
                end: event.end,
                status: event.status,
                title: event.title,
                attendees: event.attendees,
                meet_url: event.meetUrl,
                student_id: match?.kind === 'matched' ? match.studentId : null,
                service_id: match?.kind === 'matched' ? match.serviceId : null,
                ignored: match?.kind === 'ignored',
              },
            })
          })
        )
        for (const r of results) {
          if (r.error) throw new Error(r.error.message)
          const action = (r.data as { action?: string } | null)?.action
          if (action === 'created') summary.created++
          else if (action === 'adopted') summary.adopted++
          else if (action === 'moved') summary.moved++
          else if (action === 'cancelled') summary.cancelled++
          else if (action === 'unmatched') summary.unmatched++
        }
      }
    }

    // Yalnız TÜM takvimler okunduysa: yarım okumada "karşılığı yok"
    // işaretlemek, var olan dersleri yok sayardı.
    const { data: missing } = await supabase.rpc('mark_calendar_missing', {
      p_connection_id: connectionId,
      p_sync_started: syncStarted.toISOString(),
      p_window_start: window.timeMin.toISOString(),
      p_window_end: window.timeMax.toISOString(),
    })
    summary.missing = Number(missing ?? 0)

    await supabase.rpc('set_calendar_connection_state', {
      p_connection_id: connectionId,
      p_status: 'active',
      p_error: null,
      p_synced: true,
    })
    return { ...summary, ok: true }
  } catch (error) {
    const needsReauth = error instanceof GoogleReauthError
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata'
    await supabase.rpc('set_calendar_connection_state', {
      p_connection_id: connectionId,
      p_status: needsReauth ? 'needs_reauth' : null,
      p_error: message,
      p_synced: true,
    })
    return { ...summary, error: message, needsReauth }
  }
}

/**
 * Sayfa açılışında: son eşitlemeden 5 dakikadan fazla geçtiyse eşitle.
 * Süre sınırlı (Google yavaşsa sayfa beklemez) ve hata sayfayı durdurmaz.
 */
export async function syncIfStale(
  supabase: SupabaseClient,
  { workspaceId, profileId }: { workspaceId: string; profileId: string },
  timeoutMs = 8000
): Promise<SyncSummary | null> {
  if (!calendarConfigured()) return null
  const { data: conn } = await supabase
    .from('calendar_connections')
    .select('id, status, last_synced_at')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (!conn || conn.status !== 'active') return null
  const last = conn.last_synced_at ? new Date(conn.last_synced_at as string).getTime() : 0
  if (Date.now() - last < STALE_MS) return null

  return Promise.race([
    syncConnection(supabase, conn.id as string).catch(() => null),
    new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
  ])
}
