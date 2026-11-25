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

// ============================================================
// BAŞLIKTAN ÖNERİ — yalnız ÖNERİ, asla otomatik bağlama değil.
//
// Belgenin kuralı başlıktan SESSİZ tahmini yasaklar. Burada başlık,
// eşleşmeyen etkinlik listesinde öğrenci seçim kutusunu önceden doldurmak
// için kullanılır; bağlama yine öğretmenin tıklamasıyla olur. Tek bir
// öğrenciye işaret etmiyorsa öneri yoktur ("Ek ders", iki "Deniz").
// ============================================================

function foldTr(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function tokens(s: string): string[] {
  return foldTr(s).split(/[^a-z0-9]+/).filter(Boolean)
}

/** Başlık tek bir öğrenciye işaret ediyorsa onun id'si; yoksa null. */
export function suggestStudentFromTitle(
  title: string | null,
  students: { id: string; name: string }[]
): string | null {
  if (!title) return null
  const titleTokens = tokens(title)
  if (titleTokens.length === 0) return null
  const joined = ` ${titleTokens.join(' ')} `

  // 1) Tam ad başlıkta geçiyorsa en güçlü işaret.
  const full = students.filter(s => {
    const t = tokens(s.name)
    return t.length > 1 && joined.includes(` ${t.join(' ')} `)
  })
  if (full.length === 1) return full[0].id
  if (full.length > 1) return null

  // 2) İlk ad başlıkta ayrı bir sözcük olarak geçiyorsa — tek öğrenciyse.
  const first = students.filter(s => {
    const f = tokens(s.name)[0]
    return !!f && titleTokens.includes(f)
  })
  return first.length === 1 ? first[0].id : null
}
