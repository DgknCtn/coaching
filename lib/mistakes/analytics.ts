import { MISTAKE_REASONS, REASON_ADVICE, REASON_LABEL, type MistakeReason } from './reasons'
import { addDays } from './srs'
import { accuracy, net } from './net'

// HATA DEFTERİ ANALİZİ — saf, yalnız kayıtlı veriden. Akademik başarı
// UYDURULMAZ; öneri en sık nedene göre sabit bir cümledir.

export interface MistakeLite {
  reason: MistakeReason
  status: 'review' | 'learned' | 'archived'
  subject: string
  topic: string | null
  source: string | null
}

export interface ReviewLite {
  reviewedOn: string // 'YYYY-MM-DD'
  result: 'knew' | 'missed'
}

export interface QuestionLogLite {
  logDate: string
  correct: number
  wrong: number
  blank: number
  divisor: number
}

const countBy = <T>(xs: T[], key: (x: T) => string | null): { key: string; count: number }[] => {
  const m = new Map<string, number>()
  for (const x of xs) {
    const k = key(x)
    if (!k) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'tr'))
}

export function mistakeSummary(mistakes: MistakeLite[], reviews: ReviewLite[]) {
  const active = mistakes.filter(m => m.status !== 'archived')
  const learned = active.filter(m => m.status === 'learned').length
  const knew = reviews.filter(r => r.result === 'knew').length
  const reasons = MISTAKE_REASONS.map(r => ({ reason: r, label: REASON_LABEL[r], count: active.filter(m => m.reason === r).length }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count)
  const top = reasons[0]
  return {
    total: active.length,
    learnedPercent: active.length ? Math.round((learned / active.length) * 100) : null,
    reviewSuccessPercent: reviews.length ? Math.round((knew / reviews.length) * 100) : null,
    reasons,
    advice: top ? REASON_ADVICE[top.reason] : null,
    bySubject: countBy(active, m => m.subject),
    byTopic: countBy(active, m => (m.topic ? `${m.subject} · ${m.topic}` : null)).slice(0, 8),
    bySource: countBy(active, m => m.source).slice(0, 8),
  }
}

/** Son 14 gün: gün başına toplam tekrar ve "bildim" sayısı. */
export function reviewSeries(reviews: ReviewLite[], today: string, days = 14) {
  const list = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1))
  return list.map(day => {
    const dayReviews = reviews.filter(r => r.reviewedOn === day)
    return { day, total: dayReviews.length, knew: dayReviews.filter(r => r.result === 'knew').length }
  })
}

/** Gün başına soru/net özeti (en yeni gün önce). */
export function questionDays(logs: QuestionLogLite[]) {
  const m = new Map<string, { correct: number; wrong: number; blank: number; net: number }>()
  for (const l of logs) {
    const cur = m.get(l.logDate) ?? { correct: 0, wrong: 0, blank: 0, net: 0 }
    cur.correct += l.correct
    cur.wrong += l.wrong
    cur.blank += l.blank
    cur.net = Math.round((cur.net + net(l.correct, l.wrong, l.divisor)) * 100) / 100
    m.set(l.logDate, cur)
  }
  return [...m]
    .map(([day, v]) => ({ day, ...v, total: v.correct + v.wrong + v.blank, accuracy: accuracy(v.correct, v.wrong, v.blank) }))
    .sort((a, b) => (a.day < b.day ? 1 : -1))
}
