// HAFTALIK ÖĞRENCİ ÖZETİ — modele giden veri ve istem (Faz 6).
//
// ============================================================
// KİŞİSEL VERİ MODELE GİTMEZ
//
// Öğrenci reşit değil ve veri yurt dışındaki bir sağlayıcıya gidiyor.
// Bu yüzden modele YALNIZ sayılar, kitap adları/dersler, sınav türü ve
// sınıf gider. Ad, e-posta, telefon, öğrencinin mesajı, öğretmen notu
// GİTMEZ. Model öğrenciye {ÖĞRENCİ} diye hitap eder; ad, cevap geldikten
// sonra sunucuda yerine konur (personalize).
//
// Bu dosya saf: veritabanına ve ağa dokunmaz, testi var
// (tests/ai-student-week.test.ts).
// ============================================================

export const NAME_TOKEN = '{ÖĞRENCİ}'

export type SummaryKind = 'coach' | 'parent'

export interface WeekItemRow {
  status: 'pending' | 'pending_approval' | 'completed' | 'cancelled' | string
  submitted_at: string | null
  approved_at: string | null
  /** Partinin teslim tarihi (YYYY-MM-DD). */
  due_date: string
}

export interface WeekCheckInRow {
  due_at: string
  submitted_at: string | null
  mood: string | null
}

export interface WeekBookRow {
  title: string
  subject: string | null
  completion_percentage: number | null
}

export interface WeekFacts {
  exam: string | null
  grade: string | null
  dueThisWeek: number
  approvedLast7: number
  submittedLast7: number
  awaitingApproval: number
  overduePending: number
  checkInsSubmitted: number
  checkInsLate: number
  lastMood: string | null
  books: { title: string; subject: string | null; percent: number }[]
}

const DAY = 86_400_000

const MOOD: Record<string, string> = {
  iyi: 'iyi',
  idare_eder: 'idare eder',
  zorlaniyorum: 'zorlanıyorum',
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function buildWeekFacts(input: {
  now: Date
  exam: string | null
  grade: string | null
  items: WeekItemRow[]
  checkIns: WeekCheckInRow[]
  books: WeekBookRow[]
}): WeekFacts {
  const { now } = input
  const weekAgo = now.getTime() - 7 * DAY
  const today = ymd(now)
  const weekEnd = ymd(new Date(now.getTime() + 7 * DAY))
  const active = input.items.filter((i) => i.status !== 'cancelled')
  const within = (iso: string | null) => !!iso && new Date(iso).getTime() >= weekAgo

  const submittedCheckIns = input.checkIns
    .filter((c) => c.submitted_at && new Date(c.submitted_at).getTime() >= weekAgo)
    .sort((a, b) => (a.submitted_at! < b.submitted_at! ? 1 : -1))

  return {
    exam: input.exam,
    grade: input.grade,
    dueThisWeek: active.filter((i) => i.due_date >= today && i.due_date <= weekEnd).length,
    approvedLast7: active.filter((i) => i.status === 'completed' && within(i.approved_at)).length,
    submittedLast7: active.filter((i) => within(i.submitted_at)).length,
    awaitingApproval: active.filter((i) => i.status === 'pending_approval').length,
    // Teslim günü boyunca gecikme yok (R6-02): yalnız dünden eskiler.
    overduePending: active.filter((i) => i.status === 'pending' && i.due_date < today).length,
    checkInsSubmitted: submittedCheckIns.length,
    checkInsLate: input.checkIns.filter(
      (c) => !c.submitted_at && new Date(c.due_at).getTime() < now.getTime() &&
        new Date(c.due_at).getTime() >= weekAgo
    ).length,
    lastMood: submittedCheckIns[0]?.mood ? (MOOD[submittedCheckIns[0].mood] ?? null) : null,
    books: input.books.slice(0, 6).map((b) => ({
      title: b.title,
      subject: b.subject,
      percent: Math.round(Number(b.completion_percentage ?? 0)),
    })),
  }
}

function factLines(f: WeekFacts): string {
  const lines = [
    `Sınav/sınıf: ${[f.exam, f.grade].filter(Boolean).join(', ') || 'belirtilmemiş'}`,
    `Bu hafta teslimi olan ödev kalemi: ${f.dueThisWeek}`,
    `Son 7 günde öğrencinin teslim ettiği: ${f.submittedLast7}`,
    `Son 7 günde öğretmenin onayladığı: ${f.approvedLast7}`,
    `Onay bekleyen teslim: ${f.awaitingApproval}`,
    `Teslim tarihi geçmiş, yapılmamış kalem: ${f.overduePending}`,
    `Son 7 günde gönderilen durum bildirimi: ${f.checkInsSubmitted}; geciken: ${f.checkInsLate}`,
    `Son bildirimdeki ruh hâli: ${f.lastMood ?? 'bilinmiyor'}`,
  ]
  if (f.books.length) {
    lines.push('Kitap ilerlemesi (öğretmen onaylı):')
    for (const b of f.books) lines.push(`- ${b.title}${b.subject ? ` (${b.subject})` : ''}: %${b.percent}`)
  } else {
    lines.push('Atanmış kitap yok.')
  }
  return lines.join('\n')
}

const COMMON = [
  'Türkçe yaz. Yalnız verilen verilere dayan; veri yoksa uydurma, "bu hafta veri az" de.',
  `Öğrenciden yalnız ${NAME_TOKEN} diye bahset; başka ad, cinsiyet ya da kişisel ayrıntı ekleme.`,
  '"Tamamlandı" yalnız öğretmen onayıdır; öğrencinin teslimi "teslim etti" diye anlatılır.',
  'Düz metin yaz; başlık, markdown, emoji kullanma.',
].join(' ')

export function buildSummaryPrompt(kind: SummaryKind, facts: WeekFacts): { system: string; prompt: string } {
  if (kind === 'coach') {
    return {
      system:
        'Bir eğitim koçuna, öğrencisinin son haftasını özetleyen deneyimli bir asistansın. ' + COMMON,
      prompt:
        'Aşağıdaki verilerden koç için 3-4 cümlelik bir haftalık özet yaz; ardından "Öneri:" ile başlayan ' +
        'tek satırda bu hafta koçun atabileceği en faydalı bir-iki adımı söyle.\n\n' +
        factLines(facts),
    }
  }
  return {
    system:
      'Bir öğretmenin, öğrencinin velisine göndereceği kısa ve nazik haftalık bilgilendirme mesajını taslak olarak yazıyorsun. ' +
      COMMON +
      ' Veliyi suçlama, panik yaratma; olumlu olanı önce söyle, eksik varsa tek cümlede ve çözüm önerisiyle belirt.',
    prompt:
      '"Merhaba," ile başlayan, 3-4 cümlelik bir veli mesajı taslağı yaz. İmza ekleme.\n\n' + factLines(facts),
  }
}

/** Modelin yazdığı {ÖĞRENCİ} yer tutucusunu öğrencinin ilk adıyla değiştirir. */
export function personalize(text: string, fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || 'Öğrenci'
  return text.split(NAME_TOKEN).join(first)
}
