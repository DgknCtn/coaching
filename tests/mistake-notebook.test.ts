import { describe, expect, it } from 'vitest'
import { addDays, applyReview, initialState, isDue, weekAhead, INTERVAL_DAYS } from '@/lib/mistakes/srs'
import { accuracy, examTagsFor, net, penaltyDivisor, streak } from '@/lib/mistakes/net'
import { mistakeSummary, questionDays, reviewSeries } from '@/lib/mistakes/analytics'
import { daysSince, istanbulDay, todayStats } from '@/lib/mistakes/today'
import { photoPathAllowed, mistakeInputSchema, questionLogSchema, questionLogRow } from '@/lib/mistakes/schema'
import { fitWithin } from '@/lib/mistakes/image-compress'
import { MISTAKE_REASONS } from '@/lib/mistakes/reasons'
import { readFileSync } from 'node:fs'

const T = '2026-11-28'

describe('aralıklı tekrar (Leitner)', () => {
  it('yeni hata bugün tekrar edilir; bildim kutuyu ilerletir', () => {
    const s0 = initialState(T)
    expect(isDue(s0, T)).toBe(true)
    const s1 = applyReview(s0, 'knew', T)
    expect(s1).toEqual({ box: 2, status: 'review', nextReviewOn: addDays(T, INTERVAL_DAYS[2]) })
  })
  it('kutu 5’te bildim → öğrenildi; bilemedim → kutu 1, yarın', () => {
    expect(applyReview({ box: 5, status: 'review', nextReviewOn: T }, 'knew', T)).toEqual({ box: 5, status: 'learned', nextReviewOn: null })
    expect(applyReview({ box: 4, status: 'review', nextReviewOn: T }, 'missed', T)).toEqual({ box: 1, status: 'review', nextReviewOn: '2026-11-29' })
  })
  it('1 → 5 aralıkları: 1, 3, 7, 14, 30 gün', () => {
    expect(Object.values(INTERVAL_DAYS)).toEqual([1, 3, 7, 14, 30])
    let s = initialState(T)
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      s = applyReview(s, 'knew', T)
      seen.push(s.nextReviewOn!)
    }
    expect(seen).toEqual(['2026-12-01', '2026-12-05', '2026-12-12', '2026-12-28'])
  })
  it('7 günlük takvim: gecikenler bugüne sayılır', () => {
    const w = weekAhead(
      [
        { status: 'review', nextReviewOn: '2026-11-20' },
        { status: 'review', nextReviewOn: T },
        { status: 'review', nextReviewOn: '2026-11-30' },
        { status: 'learned', nextReviewOn: null },
      ],
      T
    )
    expect(w[0]).toEqual({ day: T, count: 2 })
    expect(w[2]).toEqual({ day: '2026-11-30', count: 1 })
    expect(w).toHaveLength(7)
  })
  it('ay ve yıl geçişi doğru', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })
})

describe('net ve doğruluk', () => {
  it('YKS 4:1, LGS 3:1, diğer cezasız', () => {
    expect(penaltyDivisor('TYT')).toBe(4)
    expect(penaltyDivisor('LGS')).toBe(3)
    expect(net(15, 6, 4)).toBe(13.5)
    expect(net(15, 6, 3)).toBe(13)
    expect(net(15, 6, 0)).toBe(15)
  })
  it('doğruluk; soru yoksa null', () => {
    expect(accuracy(15, 6, 4)).toBe(60)
    expect(accuracy(0, 0, 0)).toBeNull()
  })
  it('sınav türünden etiket', () => {
    expect(examTagsFor('YKS')).toEqual(['TYT', 'AYT'])
    expect(examTagsFor('LGS')).toEqual(['LGS'])
    expect(examTagsFor('IB')).toEqual(['GENEL'])
  })
  it('gün serisi: bugün kayıt yoksa dünden sayılır', () => {
    expect(streak(new Set(['2026-11-28', '2026-11-27', '2026-11-25']), T)).toBe(2)
    expect(streak(new Set(['2026-11-27', '2026-11-26']), T)).toBe(2)
    expect(streak(new Set([]), T)).toBe(0)
  })
})

describe('analiz', () => {
  it('neden dağılımı, öneri ve kırılımlar', () => {
    const s = mistakeSummary(
      [
        { reason: 'bilgi_eksik', status: 'review', subject: 'Matematik', topic: 'Türev', source: '345 AYT' },
        { reason: 'bilgi_eksik', status: 'learned', subject: 'Matematik', topic: 'Türev', source: '345 AYT' },
        { reason: 'dikkatsizlik', status: 'review', subject: 'Fizik', topic: null, source: null },
        { reason: 'islem_hatasi', status: 'archived', subject: 'Kimya', topic: null, source: null },
      ],
      [
        { reviewedOn: T, result: 'knew' },
        { reviewedOn: T, result: 'missed' },
      ]
    )
    expect(s.total).toBe(3)
    expect(s.learnedPercent).toBe(33)
    expect(s.reviewSuccessPercent).toBe(50)
    expect(s.reasons[0]).toMatchObject({ reason: 'bilgi_eksik', count: 2 })
    expect(s.advice).toMatch(/konu anlatımına/)
    expect(s.bySubject[0]).toEqual({ key: 'Matematik', count: 2 })
    expect(s.byTopic[0]).toEqual({ key: 'Matematik · Türev', count: 2 })
  })
  it('14 günlük tekrar serisi ve gün bazında soru özeti', () => {
    const series = reviewSeries([{ reviewedOn: T, result: 'knew' }], T)
    expect(series).toHaveLength(14)
    expect(series.at(-1)).toEqual({ day: T, total: 1, knew: 1 })
    const days = questionDays([
      { logDate: T, correct: 15, wrong: 6, blank: 4, divisor: 4 },
      { logDate: T, correct: 10, wrong: 5, blank: 3, divisor: 4 },
    ])
    expect(days[0]).toMatchObject({ day: T, total: 43, net: 22.25, accuracy: 58 })
  })
})


describe('bugün özeti', () => {
  it('bekleyen tekrar, bugünkü soru/net, seri ve 7 gün', () => {
    const s = todayStats(
      {
        mistakes: [
          { status: 'review', next_review_on: '2026-11-27' },
          { status: 'review', next_review_on: T },
          { status: 'review', next_review_on: '2026-12-01' },
          { status: 'learned', next_review_on: null },
        ],
        // 2026-11-27T22:30Z İstanbul'da 28 Kasım 01:30 → bugün sayılır
        reviews: [
          { reviewedAt: '2026-11-27T22:30:00Z', result: 'knew' },
          { reviewedAt: '2026-11-27T10:00:00Z', result: 'missed' },
        ],
        logs: [
          { log_date: T, correct: 15, wrong: 6, blank: 4, penalty_divisor: 4 },
          { log_date: T, correct: 10, wrong: 5, blank: 3, penalty_divisor: 4 },
          { log_date: '2026-11-27', correct: 10, wrong: 0, blank: 0, penalty_divisor: 4 },
          { log_date: '2026-11-10', correct: 10, wrong: 0, blank: 0, penalty_divisor: 4 },
        ],
      },
      T
    )
    expect(s.due).toBe(2)
    expect(s.reviewsToday).toBe(1)
    expect(s.reviewStreak).toBe(2)
    expect(s.inReview).toBe(3)
    expect(s.learned).toBe(1)
    expect(s.questionsToday).toBe(43)
    expect(s.netToday).toBe(22.25)
    expect(s.accuracyToday).toBe(58)
    expect(s.dayStreak).toBe(2)
    expect(s.questions7d).toBe(53)
    expect(s.week[0].count).toBe(2)
    expect(s.lastActivity).toBe(T)
  })
  it('İstanbul günü ve gün farkı', () => {
    expect(istanbulDay('2026-11-27T21:30:00Z')).toBe('2026-11-28')
    expect(daysSince('2026-11-25', T)).toBe(3)
    expect(daysSince(null, T)).toBeNull()
  })
})

describe('giriş doğrulaması', () => {
  const ws = '11111111-1111-4111-8111-111111111111'
  const st = '22222222-2222-4222-8222-222222222222'
  it('fotoğraf yolu yalnız öğrencinin klasörü', () => {
    expect(photoPathAllowed(null, ws, st)).toBe(true)
    expect(photoPathAllowed(`${ws}/${st}/33333333-3333-4333-8333-333333333333.webp`, ws, st)).toBe(true)
    expect(photoPathAllowed(`${ws}/44444444-4444-4444-8444-444444444444/33333333-3333-4333-8333-333333333333.webp`, ws, st)).toBe(false)
    expect(photoPathAllowed(`${ws}/${st}/../x.webp`, ws, st)).toBe(false)
  })
  it('ders zorunlu; neden listesi dışı reddedilir', () => {
    expect(mistakeInputSchema.safeParse({ examTag: 'TYT', reason: 'bilgi_eksik' }).success).toBe(false)
    expect(mistakeInputSchema.safeParse({ examTag: 'TYT', subjectText: 'Fizik', reason: 'uydurma' }).success).toBe(false)
    expect(mistakeInputSchema.safeParse({ examTag: 'TYT', subjectText: 'Fizik', reason: 'dikkatsizlik' }).success).toBe(true)
  })
  it('soru kaydı: boş kayıt reddedilir, bölen sınavdan gelir', () => {
    const base = { logDate: T, examTag: 'LGS', subjectText: 'Fen', correct: 0, wrong: 0, blank: 0 }
    expect(questionLogSchema.safeParse(base).success).toBe(false)
    const ok = questionLogSchema.parse({ ...base, correct: 5, wrong: 3 })
    expect(questionLogRow(ok).penalty_divisor).toBe(3)
  })
  it('sıkıştırma ölçüsü: oran korunur, küçük görsel büyütülmez', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1280, height: 960 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})

describe('migration 161 ile parite', () => {
  const sql = readFileSync('supabase/migrations/161_mistake_notebook.sql', 'utf8')
  it('neden CHECK listesi uygulama listesiyle aynı', () => {
    const block = sql.match(/reason\s+TEXT NOT NULL CHECK \(reason IN \(([\s\S]*?)\)\)/)![1]
    const listed = [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
    expect(listed).toEqual([...MISTAKE_REASONS])
  })
  it('record_mistake_review aralıkları srs.ts ile aynı', () => {
    expect(sql).toMatch(/CASE v_box WHEN 1 THEN 1 WHEN 2 THEN 3 WHEN 3 THEN 7 WHEN 4 THEN 14 ELSE 30 END/)
    expect(Object.values(INTERVAL_DAYS)).toEqual([1, 3, 7, 14, 30])
    expect(sql).toMatch(/v_next := v_today \+ 1;/) // bilemedim → yarın
  })
  it('veli tablolara doğrudan erişemez; anon yetkisi yok', () => {
    expect(sql).not.toMatch(/is_parent_of_student\(student_id\)/)
    for (const t of ['mistakes', 'mistake_reviews', 'question_logs', 'study_targets']) {
      expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`)
      expect(sql).toContain(`REVOKE ALL ON public.${t} FROM anon`)
    }
    expect(sql).not.toMatch(/TO anon/)
  })
  it('depolama alanı özel ve kurallar alanla sınırlı', () => {
    expect(sql).toMatch(/'mistake-photos', 'mistake-photos', FALSE/)
    expect((sql.match(/bucket_id = 'mistake-photos' AND public\._mistake_photo_access/g) ?? []).length).toBe(3)
  })
})
