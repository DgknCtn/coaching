// CALENDAR ETKİNLİĞİ → ÖĞRENCİ EŞLEŞTİRMESİ (saf; migration 157).
//
// Belgenin kuralı: "Güvenli eşleşme yoksa sistem sessiz tahmin yapmak
// yerine öğretmenden bir defalık seçim istemeli." Sıra:
//   1. Bu örneğe özel kayıt ('event:' + örnek id) ya da seri kaydı
//      (recurringEventId / tekil etkinlik id) → kayıtlı eşleşme (ya da yok say).
//   2. Katılımcı e-postaları TEK bir öğrenciye (öğrenci ya da veli
//      e-postası) çıkıyor VE o öğrencinin TEK aktif birebir hizmeti varsa
//      → otomatik.
//   3. Diğer her durum → eşleşmeyen; öğretmen bir kez seçer.
// Başlık ASLA kullanılmaz: "Ek ders" ya da öğrenci adı geçen bir başlık
// yanlış öğrenciye bağlanmanın en kolay yoludur.

/** Google yanıtının eşleştirmede kullanılan alt kümesi. */
export interface RawCalendarEvent {
  id: string
  status?: string
  summary?: string
  recurringEventId?: string
  originalStartTime?: { dateTime?: string; date?: string }
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: { email?: string; self?: boolean }[]
  hangoutLink?: string
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
}

export interface NormalizedEvent {
  calendarId: string
  eventId: string
  recurringEventId: string | null
  /** Seri anahtarı: tekrarlayanda recurringEventId, tekilde etkinlik id. */
  seriesKey: string
  originalStart: string | null
  start: string | null
  end: string | null
  status: 'confirmed' | 'cancelled'
  title: string | null
  /** Öğretmenin kendisi hariç, küçük harf. */
  attendees: string[]
  meetUrl: string | null
}

/**
 * Tüm gün etkinlikleri (start.date) ders değildir — atlanır (null).
 * İptal edilen örnekte Google başlangıcı vermeyebilir; durum yeter.
 */
export function normalizeEvent(raw: RawCalendarEvent, calendarId: string): NormalizedEvent | null {
  const cancelled = raw.status === 'cancelled'
  const start = raw.start?.dateTime ?? null
  if (!cancelled && !start) return null

  const meetFromConference =
    raw.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri ?? null

  return {
    calendarId,
    eventId: raw.id,
    recurringEventId: raw.recurringEventId ?? null,
    seriesKey: raw.recurringEventId ?? raw.id,
    originalStart: raw.originalStartTime?.dateTime ?? start,
    start,
    end: raw.end?.dateTime ?? null,
    status: cancelled ? 'cancelled' : 'confirmed',
    title: raw.summary?.trim() || null,
    attendees: (raw.attendees ?? [])
      .filter(a => !a.self && a.email)
      .map(a => a.email!.trim().toLocaleLowerCase('en')),
    meetUrl: raw.hangoutLink ?? meetFromConference,
  }
}

export interface MatchContext {
  /** series_key (ya da 'event:'+id) → kayıtlı karar. */
  savedMatches: Map<string, { studentId: string; serviceId: string } | { ignored: true }>
  /** küçük harf e-posta → bu e-postaya bağlı öğrenci id'leri. */
  studentsByEmail: Map<string, string[]>
  /** öğrenci id → aktif BİREBİR hizmet id'leri. */
  birebirServicesByStudent: Map<string, string[]>
}

export type MatchResult =
  | { kind: 'matched'; studentId: string; serviceId: string; via: 'saved' | 'email' }
  | { kind: 'ignored' }
  | { kind: 'unmatched'; reason: 'no_attendee' | 'ambiguous_student' | 'ambiguous_service' }

export function matchEvent(event: NormalizedEvent, ctx: MatchContext): MatchResult {
  const saved = ctx.savedMatches.get(`event:${event.eventId}`) ?? ctx.savedMatches.get(event.seriesKey)
  if (saved) {
    if ('ignored' in saved) return { kind: 'ignored' }
    return { kind: 'matched', studentId: saved.studentId, serviceId: saved.serviceId, via: 'saved' }
  }

  const students = new Set<string>()
  for (const email of event.attendees) {
    for (const id of ctx.studentsByEmail.get(email) ?? []) students.add(id)
  }
  if (students.size === 0) return { kind: 'unmatched', reason: 'no_attendee' }
  if (students.size > 1) return { kind: 'unmatched', reason: 'ambiguous_student' }

  const [studentId] = [...students]
  const services = ctx.birebirServicesByStudent.get(studentId) ?? []
  if (services.length !== 1) return { kind: 'unmatched', reason: 'ambiguous_service' }
  return { kind: 'matched', studentId, serviceId: services[0], via: 'email' }
}

/** Eşitleme penceresi: bugün −30 / +120 gün. */
export function syncWindow(now: Date = new Date()): { timeMin: Date; timeMax: Date } {
  const day = 86_400_000
  return { timeMin: new Date(now.getTime() - 30 * day), timeMax: new Date(now.getTime() + 120 * day) }
}
