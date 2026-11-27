import { addDays, isDue, weekAhead } from './srs'
import { accuracy, net, streak } from './net'

// "BUGÜN" ÖZETİ — öğrenci ana sayfası kartı ve öğretmen ekranları için
// saf hesap. `istanbulDay` zaman damgasını İstanbul gününe çevirir.

export function istanbulDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
}

export interface TodayInput {
  mistakes: { status: string; next_review_on: string | null }[]
  reviews: { reviewedAt: string; result: 'knew' | 'missed' }[]
  logs: { log_date: string; correct: number; wrong: number; blank: number; penalty_divisor: number }[]
}

export function todayStats({ mistakes, reviews, logs }: TodayInput, today: string) {
  const reviewDays = reviews.map(r => istanbulDay(r.reviewedAt))
  const weekStart = addDays(today, -6)
  const todayLogs = logs.filter(l => l.log_date === today)
  const c = todayLogs.reduce((a, l) => a + l.correct, 0)
  const w = todayLogs.reduce((a, l) => a + l.wrong, 0)
  const b = todayLogs.reduce((a, l) => a + l.blank, 0)
  const lastActivity = [...reviewDays, ...logs.map(l => l.log_date)].sort().at(-1) ?? null
  return {
    due: mistakes.filter(m => isDue({ status: m.status as 'review', nextReviewOn: m.next_review_on }, today)).length,
    reviewsToday: reviewDays.filter(d => d === today).length,
    reviewStreak: streak(new Set(reviewDays), today),
    reviews7d: reviewDays.filter(d => d >= weekStart).length,
    inReview: mistakes.filter(m => m.status === 'review').length,
    learned: mistakes.filter(m => m.status === 'learned').length,
    questionsToday: c + w + b,
    netToday: Math.round(todayLogs.reduce((a, l) => a + net(l.correct, l.wrong, l.penalty_divisor), 0) * 100) / 100,
    accuracyToday: accuracy(c, w, b),
    dayStreak: streak(new Set(logs.map(l => l.log_date)), today),
    questions7d: logs.filter(l => l.log_date >= weekStart).reduce((a, l) => a + l.correct + l.wrong + l.blank, 0),
    accuracy7d: (() => {
      const wk = logs.filter(l => l.log_date >= weekStart)
      return accuracy(
        wk.reduce((a, l) => a + l.correct, 0),
        wk.reduce((a, l) => a + l.wrong, 0),
        wk.reduce((a, l) => a + l.blank, 0)
      )
    })(),
    week: weekAhead(mistakes.map(m => ({ status: m.status as 'review', nextReviewOn: m.next_review_on })), today),
    /** Son kayıt günü (tekrar ya da soru); hiç yoksa null. */
    lastActivity,
  }
}

/** Son etkinlikten bu yana gün (bugün = 0); hiç yoksa null. */
export function daysSince(day: string | null, today: string): number | null {
  if (!day) return null
  return Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000)
}
