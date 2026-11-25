import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarState } from '@/lib/session-state'

// Calendar bağları (157) — Ders & Görüşmeler'in okuduğu iki küçük sorgu.

/**
 * Oturumlara Calendar bilgisini ekler: iptal/karşılık uyarısı
 * (service_sessions.calendar_state) ve Meet bağlantısı (yalnız okunur).
 *
 * NEDEN AYRI SORGU: oturum ekranları `student_service_session_view`
 * (140) üzerinden okur ve o görünümde calendar_state YOK. Sütunu ortak
 * SESSION_SELECT'e eklemek sorguyu düşürür ve ekran boş kalır — bir kez
 * oldu. Her iki sorgu da çalışma alanı düzeyinde ve küçük: yalnız uyarısı
 * olan oturumlar ve Meet bağlantılı eşleşmiş Calendar örnekleri.
 */
export async function attachCalendarInfo<
  T extends { id: string; calendarState?: CalendarState | null; meetUrl?: string | null },
>(supabase: SupabaseClient, workspaceId: string, sessions: T[]): Promise<T[]> {
  if (sessions.length === 0) return sessions
  const ids = new Set(sessions.map(s => s.id))
  const [{ data: states }, { data: links }] = await Promise.all([
    supabase
      .from('service_sessions')
      .select('id, calendar_state')
      .eq('workspace_id', workspaceId)
      .not('calendar_state', 'is', null)
      .limit(1000),
    supabase
      .from('calendar_event_links')
      .select('session_id, meet_url')
      .eq('workspace_id', workspaceId)
      .eq('match_state', 'matched')
      .not('session_id', 'is', null)
      .not('meet_url', 'is', null)
      .limit(1000),
  ])
  const stateById = new Map(
    ((states ?? []) as { id: string; calendar_state: CalendarState }[])
      .filter(r => ids.has(r.id))
      .map(r => [r.id, r.calendar_state])
  )
  const meetById = new Map(
    ((links ?? []) as { session_id: string; meet_url: string }[])
      .filter(r => ids.has(r.session_id))
      .map(r => [r.session_id, r.meet_url])
  )
  if (stateById.size === 0 && meetById.size === 0) return sessions
  return sessions.map(s =>
    stateById.has(s.id) || meetById.has(s.id)
      ? { ...s, calendarState: stateById.get(s.id) ?? null, meetUrl: meetById.get(s.id) ?? null }
      : s
  )
}

export interface UnmatchedCalendarEvent {
  linkId: string
  title: string | null
  startAt: string | null
  recurring: boolean
  attendees: string[]
}

type UnmatchedRow = {
  id: string
  title: string | null
  start_at: string | null
  recurring_event_id: string | null
  attendee_emails: string[] | null
}

const UNMATCHED_SELECT = 'id, title, start_at, recurring_event_id, attendee_emails'

/**
 * Öğrencinin sayfasında gösterilecek eşleşmeyen etkinlikler — öğretmenden
 * BİR KEZ seçim ister. İki grup:
 *   1. Davetlilerinde BU öğrencinin ya da velisinin e-postası olanlar
 *      (ör. öğrencinin birden çok birebir hizmeti var: hangisi?).
 *   2. Hiç katılımcısı olmayan, yakın tarihli etkinlikler ("Ek ders" gibi;
 *      kime ait olduğunu yalnız öğretmen bilir).
 * Başka kişilerle yapılan toplantılar öğrenci sayfalarına düşmez. Her
 * sorgu kendi sınırıyla: takvimdeki yüzlerce etkinlik ilgili olanı itmez.
 */
export async function loadUnmatchedEvents(
  supabase: SupabaseClient,
  workspaceId: string,
  studentId: string
): Promise<UnmatchedCalendarEvent[]> {
  const day = 86_400_000
  const now = Date.now()

  const [{ data: student }, { data: parents }] = await Promise.all([
    supabase.from('students').select('email').eq('id', studentId).eq('workspace_id', workspaceId).maybeSingle(),
    supabase
      .from('parent_student_links')
      .select('profiles(email)')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .eq('status', 'active'),
  ])
  const emails = new Set<string>()
  const add = (e: string | null | undefined) => {
    const k = e?.trim().toLocaleLowerCase('en')
    if (k) emails.add(k)
  }
  add((student as { email: string | null } | null)?.email)
  for (const p of (parents ?? []) as unknown as { profiles: { email: string | null } | { email: string | null }[] | null }[]) {
    add((Array.isArray(p.profiles) ? p.profiles[0] : p.profiles)?.email)
  }

  const base = () =>
    supabase
      .from('calendar_event_links')
      .select(UNMATCHED_SELECT)
      .eq('workspace_id', workspaceId)
      .eq('match_state', 'unmatched')
      .neq('event_status', 'cancelled')

  const [own, open] = await Promise.all([
    emails.size > 0
      ? base()
          .overlaps('attendee_emails', [...emails])
          .gte('start_at', new Date(now - 30 * day).toISOString())
          .order('start_at')
          .limit(100)
      : Promise.resolve({ data: [] as UnmatchedRow[] }),
    base()
      .eq('attendee_emails', '{}')
      .gte('start_at', new Date(now - 7 * day).toISOString())
      .lte('start_at', new Date(now + 30 * day).toISOString())
      .order('start_at')
      .limit(100),
  ])

  // Aynı serinin her tarihi ayrı satır; ekranda seri başına bir satır yeter.
  // Önce öğrencinin kendi etkinlikleri.
  const seen = new Set<string>()
  const out: UnmatchedCalendarEvent[] = []
  for (const r of [...((own.data ?? []) as UnmatchedRow[]), ...((open.data ?? []) as UnmatchedRow[])]) {
    const key = r.recurring_event_id ?? r.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      linkId: r.id,
      title: r.title,
      startAt: r.start_at,
      recurring: !!r.recurring_event_id,
      attendees: r.attendee_emails ?? [],
    })
    if (out.length >= 30) break
  }
  return out
}
