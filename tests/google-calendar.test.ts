import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { matchEvent, normalizeEvent, suggestStudentFromTitle, type MatchContext, type RawCalendarEvent } from '@/lib/calendar/match'
import { buildHomeworkCheckIn, buildLessonReminder, locativeSuffix, whatsappShareUrl } from '@/lib/share-text'

// `server-only` testte boş modül: yardımcılar saf ama dosya sunucuya özel.
vi.mock('server-only', () => ({}))

// ============================================================
// GOOGLE CALENDAR ENTEGRASYONU (157) — belge 23.11.2026
//
// Kabul senaryolarının saf kısmı: eşleştirme sırası, başlığın asla
// kullanılmaması, iptal/taşıma normalizasyonu, anahtar şifreleme ve
// WhatsApp ara çözüm metinleri. Migration'ın sözleşmesi metin olarak
// denetlenir (repodaki *-sql testleriyle aynı yöntem).
// ============================================================

const STUDENT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const SERVICE = '33333333-3333-4333-8333-333333333333'
const SERVICE_2 = '44444444-4444-4444-8444-444444444444'

function ctx(over: Partial<MatchContext> = {}): MatchContext {
  return {
    savedMatches: new Map(),
    studentsByEmail: new Map([['doga@ornek.com', [STUDENT]]]),
    birebirServicesByStudent: new Map([[STUDENT, [SERVICE]]]),
    ...over,
  }
}

function raw(over: Partial<RawCalendarEvent> = {}): RawCalendarEvent {
  return {
    id: 'evt_20261128T070000Z',
    status: 'confirmed',
    summary: 'Matematik',
    recurringEventId: 'evt',
    originalStartTime: { dateTime: '2026-11-28T10:00:00+03:00' },
    start: { dateTime: '2026-11-28T10:00:00+03:00' },
    end: { dateTime: '2026-11-28T11:00:00+03:00' },
    attendees: [{ email: 'ogretmen@ornek.com', self: true }, { email: 'Doga@Ornek.com' }],
    hangoutLink: 'https://meet.google.com/abc-defg-hij',
    ...over,
  }
}

describe('normalizeEvent', () => {
  it('tekrarlayan örnek: seri anahtarı recurringEventId, öğretmen katılımcılardan çıkar, e-posta küçük harf', () => {
    const e = normalizeEvent(raw(), 'primary')!
    expect(e.seriesKey).toBe('evt')
    expect(e.attendees).toEqual(['doga@ornek.com'])
    expect(e.meetUrl).toBe('https://meet.google.com/abc-defg-hij')
    expect(e.status).toBe('confirmed')
  })

  it('tekil etkinlikte seri anahtarı etkinliğin kendi id\'si', () => {
    const e = normalizeEvent(raw({ id: 'tek', recurringEventId: undefined, originalStartTime: undefined }), 'primary')!
    expect(e.seriesKey).toBe('tek')
    expect(e.originalStart).toBe(e.start)
  })

  it('taşınan örnek: ilk plan (originalStart) ile yeni saat (start) ayrı kalır', () => {
    const e = normalizeEvent(raw({ start: { dateTime: '2026-11-25T20:00:00+03:00' } }), 'primary')!
    expect(e.originalStart).toBe('2026-11-28T10:00:00+03:00')
    expect(e.start).toBe('2026-11-25T20:00:00+03:00')
  })

  it('iptal edilen örnek başlangıç olmadan da işlenir (silinmez, işaretlenir)', () => {
    const e = normalizeEvent({ id: 'x', status: 'cancelled', recurringEventId: 'evt' }, 'primary')!
    expect(e.status).toBe('cancelled')
  })

  it('tüm gün etkinliği ders sayılmaz', () => {
    expect(normalizeEvent(raw({ start: { date: '2026-11-28' } }), 'primary')).toBeNull()
  })

  it('Meet bağlantısı conferenceData\'dan da okunur', () => {
    const e = normalizeEvent(
      raw({ hangoutLink: undefined, conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/x' }] } }),
      'primary'
    )!
    expect(e.meetUrl).toBe('https://meet.google.com/x')
  })
})

describe('matchEvent — güvenli eşleşme yoksa tahmin yok', () => {
  it('tek öğrenci + tek birebir hizmet → otomatik', () => {
    expect(matchEvent(normalizeEvent(raw(), 'primary')!, ctx())).toEqual({
      kind: 'matched', studentId: STUDENT, serviceId: SERVICE, via: 'email',
    })
  })

  it('"Ek ders" başlığı ve katılımcı yok → eşleşmeyen (başlık asla kullanılmaz)', () => {
    const e = normalizeEvent(raw({ summary: 'Doğa ek ders', attendees: [] }), 'primary')!
    expect(matchEvent(e, ctx())).toEqual({ kind: 'unmatched', reason: 'no_attendee' })
  })

  it('iki öğrenciye çıkan e-posta (ortak veli) → eşleşmeyen', () => {
    const c = ctx({ studentsByEmail: new Map([['doga@ornek.com', [STUDENT, OTHER]]]) })
    expect(matchEvent(normalizeEvent(raw(), 'primary')!, c)).toEqual({ kind: 'unmatched', reason: 'ambiguous_student' })
  })

  it('öğrencinin iki birebir hizmeti → eşleşmeyen', () => {
    const c = ctx({ birebirServicesByStudent: new Map([[STUDENT, [SERVICE, SERVICE_2]]]) })
    expect(matchEvent(normalizeEvent(raw(), 'primary')!, c)).toEqual({ kind: 'unmatched', reason: 'ambiguous_service' })
  })

  it('kayıtlı seri eşleşmesi e-postadan önce gelir', () => {
    const c = ctx({ savedMatches: new Map([['evt', { studentId: OTHER, serviceId: SERVICE_2 }]]) })
    expect(matchEvent(normalizeEvent(raw(), 'primary')!, c)).toMatchObject({ studentId: OTHER, via: 'saved' })
  })

  it('örneğe özel kayıt seri kaydını geçer; yok sayılan seri yok sayılır', () => {
    const e = normalizeEvent(raw(), 'primary')!
    const c = ctx({
      savedMatches: new Map<string, { studentId: string; serviceId: string } | { ignored: true }>([
        ['evt', { ignored: true }],
        [`event:${e.eventId}`, { studentId: STUDENT, serviceId: SERVICE }],
      ]),
    })
    expect(matchEvent(e, c)).toMatchObject({ kind: 'matched', via: 'saved' })
    expect(matchEvent({ ...e, eventId: 'baska' }, c)).toEqual({ kind: 'ignored' })
  })
})

describe('suggestStudentFromTitle — yalnız öneri', () => {
  const students = [
    { id: 'dunya', name: 'Dünya Kaya' },
    { id: 'doga', name: 'Doğa' },
    { id: 'deniz1', name: 'Deniz Ak' },
    { id: 'deniz2', name: 'Deniz Er' },
    { id: 'test', name: 'Test 1 Öğrenci' },
    { id: 'isik', name: 'Işık' },
  ]
  it('ilk ad ayrı sözcükse, büyük/küçük harf ve Türkçe karakter farkıyla', () => {
    expect(suggestStudentFromTitle('Dünya | Online Ders | 60 dk', students)).toBe('dunya')
    expect(suggestStudentFromTitle('DOĞA ders', students)).toBe('doga')
    expect(suggestStudentFromTitle('isik koçluk', students)).toBe('isik')
  })
  it('tam ad ilk adın belirsizliğini çözer', () => {
    expect(suggestStudentFromTitle('Deniz Er - Matematik', students)).toBe('deniz2')
    expect(suggestStudentFromTitle('Test 1 Öğrenci deneme', students)).toBe('test')
  })
  it('belirsiz ya da ad yoksa öneri yok', () => {
    expect(suggestStudentFromTitle('Deniz | Online Ders', students)).toBeNull()
    expect(suggestStudentFromTitle('Ek ders', students)).toBeNull()
    expect(suggestStudentFromTitle('Dünyalar', students)).toBeNull()
    expect(suggestStudentFromTitle(null, students)).toBeNull()
  })
})

describe('anahtar şifreleme', () => {
  const KEY = 'ab'.repeat(32)
  beforeEach(() => vi.stubEnv('CALENDAR_TOKEN_KEY', KEY))
  afterEach(() => vi.unstubAllEnvs())

  it('gidiş-dönüş; her şifreleme farklı (rastgele IV)', async () => {
    const { decryptToken, encryptToken } = await import('@/lib/calendar/crypto')
    const a = encryptToken('1//refresh-token')
    const b = encryptToken('1//refresh-token')
    expect(a).not.toBe(b)
    expect(a.startsWith('v1:')).toBe(true)
    expect(decryptToken(a)).toBe('1//refresh-token')
  })

  it('kurcalanmış veri açılmaz', async () => {
    const { decryptToken, encryptToken } = await import('@/lib/calendar/crypto')
    const parts = encryptToken('gizli').split(':')
    parts[3] = Buffer.from('baska').toString('base64')
    expect(() => decryptToken(parts.join(':'))).toThrow()
  })

  it('panele tırnakla/boşlukla yapıştırılan anahtar da çalışır', async () => {
    vi.stubEnv('CALENDAR_TOKEN_KEY', ` "${KEY}" `)
    const { decryptToken, encryptToken } = await import('@/lib/calendar/crypto')
    expect(decryptToken(encryptToken('x'))).toBe('x')
  })

  it('anahtar yoksa açık hata', async () => {
    vi.stubEnv('CALENDAR_TOKEN_KEY', '')
    const { CalendarKeyError, encryptToken } = await import('@/lib/calendar/crypto')
    expect(() => encryptToken('x')).toThrow(CalendarKeyError)
  })
})

describe('WhatsApp ara çözüm metinleri', () => {
  const now = new Date('2026-11-27T12:00:00+03:00')

  it('yarın sabah online ders + Meet bağlantısı', () => {
    const text = buildLessonReminder({
      studentName: 'Doğa Yılmaz',
      at: '2026-11-28T10:00:00+03:00',
      online: true,
      subject: 'Matematik',
      meetUrl: 'https://meet.google.com/abc',
      now,
    })
    expect(text).toBe(
      "Merhaba Doğa, yarın sabah saat 10.00'da online matematik dersin var.\nDerse katıl: https://meet.google.com/abc"
    )
  })

  it('bugün akşam, Meet yok', () => {
    expect(buildLessonReminder({ studentName: 'Ali', at: '2026-11-27T20:00:00+03:00', now })).toBe(
      "Merhaba Ali, bugün akşam saat 20.00'de dersin var."
    )
  })

  it('saat eki okunuşa göre', () => {
    expect(locativeSuffix(10, 0)).toBe('da')
    expect(locativeSuffix(20, 0)).toBe('de')
    expect(locativeSuffix(13, 0)).toBe('te')
    expect(locativeSuffix(9, 0)).toBe('da')
    expect(locativeSuffix(14, 30)).toBe('da')
    expect(locativeSuffix(16, 45)).toBe('te')
  })

  it('ödev yoklaması ve wa.me bağlantısı', () => {
    expect(buildHomeworkCheckIn('Doğa Yılmaz')).toMatch(/^Merhaba Doğa, bu haftaki çalışmaların/)
    expect(whatsappShareUrl('a b')).toBe('https://wa.me/?text=a%20b')
  })
})

describe('Google 403 gerekçeleri', () => {
  it('izin kutusu boş → yeniden bağlan; API kapalı → açık mesaj; bilinmeyen → gerekçe görünür', async () => {
    const { calendarApiError, GoogleReauthError } = await import('@/lib/google/calendar')
    const scope = calendarApiError(403, { error: { errors: [{ reason: 'insufficientPermissions' }] } })
    expect(scope).toBeInstanceOf(GoogleReauthError)
    expect(scope.message).toMatch(/Takvimlerinizi görme/)
    expect(calendarApiError(403, { error: { details: [{ reason: 'SERVICE_DISABLED' }] } }).message).toMatch(/Calendar API" etkin değil/)
    expect(calendarApiError(403, { error: { errors: [{ reason: 'forbidden' }] } }).message).toBe('Google Calendar hatası: 403 (forbidden)')
  })
})

describe('migration 157 sözleşmesi', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/157_google_calendar.sql'), 'utf8')
  const fn = (name: string) => {
    const start = sql.indexOf(`FUNCTION public.${name}(`)
    expect(start, name).toBeGreaterThan(-1)
    return sql.slice(start, sql.indexOf('$$;', sql.indexOf('$$', start) + 2))
  }

  it('anahtar tablosunda RLS açık ve HİÇ politika yok', () => {
    expect(sql).toMatch(/ALTER TABLE public\.calendar_secrets ENABLE ROW LEVEL SECURITY/)
    expect(sql).not.toMatch(/CREATE POLICY[^;]*ON public\.calendar_secrets/)
  })

  it('tekrarsızlık: örnek başına tek bağ, oturum başına tek örnek', () => {
    expect(sql).toMatch(/UNIQUE \(connection_id, calendar_id, google_event_id\)/)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_event_links_session/)
  })

  it('kaynak kısıtı gerçek adıyla (_chk) yeniden tanımlanır ve calendar içerir', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS service_sessions_source_chk/)
    expect(sql).toMatch(/'takvim', 'elle', 'telafi', 'calendar'/)
  })

  it('generate_service_sessions bağlı hizmeti calendar_linked_from sonrası üretmez', () => {
    expect(fn('generate_service_sessions')).toMatch(/s\.calendar_linked_from IS NULL OR g\.gun < s\.calendar_linked_from/)
  })

  it('apply_calendar_event yalnız planlanan oturumu değiştirir, tahakkuk üretmez', () => {
    const body = fn('apply_calendar_event')
    expect(body).toMatch(/status = 'planlandi'/)
    expect(body).not.toMatch(/sync_session_accrual/)
    expect(body).not.toMatch(/status\s*=\s*'yapildi'/)
    expect(body).not.toMatch(/DELETE FROM public\.service_sessions/)
  })

  it('anon\'a yetki yok; SECURITY DEFINER fonksiyonlar search_path sabit', () => {
    expect(sql).not.toMatch(/GRANT[^;]*TO\s+anon/i)
    const definers = sql.match(/SECURITY DEFINER/g) ?? []
    const paths = sql.match(/SET search_path = public/g) ?? []
    expect(definers.length).toBeGreaterThan(0)
    expect(paths.length).toBeGreaterThanOrEqual(definers.length)
  })
})
