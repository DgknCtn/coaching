import type { SupabaseClient } from '@supabase/supabase-js'

// Calendar bağları (157) — Ders & Görüşmeler'in okuduğu iki küçük sorgu.

/** Oturumlara Calendar etkinliğindeki Meet bağlantısını ekler (yalnız okunur). */
export async function attachMeetUrls<T extends { id: string; source?: string; meetUrl?: string | null }>(
  supabase: SupabaseClient,
  sessions: T[]
): Promise<T[]> {
  const ids = sessions.filter(s => s.source === 'calendar').map(s => s.id)
  if (ids.length === 0) return sessions
  const { data } = await supabase
    .from('calendar_event_links')
    .select('session_id, meet_url')
    .in('session_id', ids)
  const byId = new Map(((data ?? []) as { session_id: string; meet_url: string | null }[]).map(r => [r.session_id, r.meet_url]))
  return sessions.map(s => (byId.has(s.id) ? { ...s, meetUrl: byId.get(s.id) ?? null } : s))
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
