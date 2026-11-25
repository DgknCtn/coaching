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

/**
 * Öğrenciyle güvenli eşleşmeyen etkinlikler — öğretmenden BİR KEZ seçim
 * ister. Geçmiş 30 günden ileriye; en fazla 50 (eski olanlar 30 günde
 * temizlenir, mark_calendar_missing).
 */
export async function loadUnmatchedEvents(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<UnmatchedCalendarEvent[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data } = await supabase
    .from('calendar_event_links')
    .select('id, title, start_at, recurring_event_id, attendee_emails, event_status')
    .eq('workspace_id', workspaceId)
    .eq('match_state', 'unmatched')
    .neq('event_status', 'cancelled')
    .gte('start_at', since)
    .order('start_at')
    .limit(50)

  // Aynı serinin her tarihi ayrı satır; ekranda seri başına bir satır yeter.
  const seen = new Set<string>()
  const out: UnmatchedCalendarEvent[] = []
  for (const r of (data ?? []) as {
    id: string
    title: string | null
    start_at: string | null
    recurring_event_id: string | null
    attendee_emails: string[] | null
  }[]) {
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
  }
  return out
}
