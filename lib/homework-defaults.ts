// ÖDEV VERME AKIŞI — VARSAYILANLAR (saf; "Ödev Verme Akışını Kısaltma",
// 26.11.2026).
//
// İki karar burada, ekranlardan bağımsız ve test edilebilir:
//   pickDefaultDue      — son teslimin varsayılanı. Geçmiş bir tarih ASLA
//                         varsayılan olmaz (belge §4: "22 Kasım, 4 gün geçti").
//   suggestScopeForBook — havuzdan atanan kitabın ders/kapsam önerisi.

export type DefaultDueSource = 'draft' | 'flow' | 'session' | 'anchor'

export interface DefaultDue {
  /** ISO; null = öğretmen elle girer. */
  dueAt: string | null
  source: DefaultDueSource | null
  /** Hizmetten türediyse hangi hizmet (yeni hafta 'anchor' kaynağıyla açılır). */
  serviceId: string | null
  /**
   * Aktif hafta var ama son teslimi geçmiş: hafta kapatılmamış. Yayında
   * "Geçen hafta kapanmamış, kapatıp yeni haftaya yayımlayayım mı?" sorulur.
   */
  stale: boolean
}

export interface NextSessionCandidate {
  serviceId: string
  /** current_planned_at — taşınmış ve Calendar'dan gelen dersler doğru gelir. */
  at: string
}

/**
 * Sıradaki planlı dersten son teslim: ana temas hizmetinin dersi önce,
 * yoksa en yakın ders. Hizmetin teslim ofseti uygulanır; ofset sonrası
 * geçmişte kalan ders atlanır.
 */
export function dueFromNextSession(
  sessions: NextSessionCandidate[],
  offsetByService: Map<string, number>,
  preferredServiceId: string | null,
  now: Date
): { dueAt: string; serviceId: string } | null {
  const candidates = sessions
    .map(s => {
      const offset = offsetByService.get(s.serviceId) ?? 0
      return { serviceId: s.serviceId, due: new Date(new Date(s.at).getTime() - offset * 60_000) }
    })
    .filter(c => !Number.isNaN(c.due.getTime()) && c.due.getTime() > now.getTime())
    .sort((a, b) => a.due.getTime() - b.due.getTime())
  const pick =
    (preferredServiceId ? candidates.find(c => c.serviceId === preferredServiceId) : undefined) ?? candidates[0]
  return pick ? { dueAt: pick.due.toISOString(), serviceId: pick.serviceId } : null
}

/**
 * Öncelik: ileri tarihli taslak > ileri tarihli aktif hafta > sıradaki
 * planlı ders > ana temasın haftalık programı > boş.
 */
export function pickDefaultDue(input: {
  /** Taslağın kayıtlı son teslimi (ISO ya da yerel gün 'YYYY-MM-DD'). */
  draftDue: string | null
  activeFlowDueAt: string | null
  nextSession: { dueAt: string; serviceId: string } | null
  anchor: { dueAt: string; serviceId: string } | null
  now: Date
  /** Yerel bugün 'YYYY-MM-DD' — yalnız gün olarak kaydedilmiş taslak için. */
  today: string
}): DefaultDue {
  const { draftDue, activeFlowDueAt, nextSession, anchor, now, today } = input
  const future = (iso: string | null | undefined) => !!iso && new Date(iso).getTime() > now.getTime()
  const stale = !!activeFlowDueAt && !future(activeFlowDueAt)

  if (draftDue) {
    const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(draftDue)
    if (dayOnly ? draftDue >= today : future(draftDue)) {
      return { dueAt: dayOnly ? null : draftDue, source: 'draft', serviceId: null, stale }
    }
  }
  if (activeFlowDueAt && !stale) return { dueAt: activeFlowDueAt, source: 'flow', serviceId: null, stale }
  if (nextSession && future(nextSession.dueAt)) {
    return { dueAt: nextSession.dueAt, source: 'session', serviceId: nextSession.serviceId, stale }
  }
  if (anchor && future(anchor.dueAt)) return { dueAt: anchor.dueAt, source: 'anchor', serviceId: anchor.serviceId, stale }
  return { dueAt: null, source: null, serviceId: null, stale }
}

export interface ScopeLike {
  id: string
  /** "10. Sınıf Matematik" — alanlar boşsa bilgi adda durur. */
  name?: string
  subject: string | null
  levelExam: string | null
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLocaleLowerCase('tr')

/** Türkçe harf duyarsız sözcükler: "10. Sınıf" → ["10", "sinif"]. */
function words(s: string | null | undefined): string[] {
  return norm(s)
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/**
 * Kitabın ders/kapsam önerisi, sırayla — her adımda TEK eşleşme şart:
 *   1. ders + sınav düzeyi alanları
 *   2. kapsam ADI kitabın ders ve düzey sözcüklerinin hepsini içeriyor
 *      ("10. Sınıf Matematik" ⊇ {10, sinif, matematik}). Kabul testinde
 *      (27.11.2026) kapsamların alanları boştu, bilgi yalnız addaydı.
 *   3. yalnız ders alanı
 * Belirsizse öneri yok — öğretmen seçer (yanlış kapsam ders bloklarını bozar).
 */
export function suggestScopeForBook(
  book: { subject: string | null; levelExam: string | null },
  scopes: ScopeLike[]
): string | null {
  const subject = norm(book.subject)
  if (!subject) return null
  const bySubject = scopes.filter(s => norm(s.subject) === subject)
  const level = norm(book.levelExam)
  if (level) {
    const exact = bySubject.filter(s => norm(s.levelExam) === level)
    if (exact.length === 1) return exact[0].id
    if (exact.length > 1) return null

    const wanted = [...words(book.subject), ...words(book.levelExam)]
    const byName = scopes.filter(s => {
      const have = new Set(words(s.name))
      return wanted.every(w => have.has(w))
    })
    if (byName.length === 1) return byName[0].id
    if (byName.length > 1) return null
  }
  return bySubject.length === 1 ? bySubject[0].id : null
}
