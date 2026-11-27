import { mistakeSummary, questionDays, reviewSeries } from '@/lib/mistakes/analytics'
import type { MistakeData } from '@/lib/mistakes/load'
import { formatNet } from '@/lib/mistakes/net'
import { istanbulDay } from '@/lib/mistakes/today'

// ANALİZ — yalnız kayıtlı veriden. Öneri cümlesi en sık nedene göre
// sabit bir kalıptır; başarı tahmini YAPILMAZ.

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function MistakeAnalysis({ data, today, audience }: { data: MistakeData; today: string; audience: 'student' | 'teacher' }) {
  const s = mistakeSummary(
    data.mistakes.map(m => ({ reason: m.reason, status: m.status, subject: `${m.exam_tag} · ${m.subject}`, topic: m.topic, source: m.source })),
    data.reviews.map(r => ({ reviewedOn: istanbulDay(r.reviewedAt), result: r.result }))
  )
  const series = reviewSeries(
    data.reviews.map(r => ({ reviewedOn: istanbulDay(r.reviewedAt), result: r.result })),
    today
  )
  const maxDay = Math.max(1, ...series.map(d => d.total))
  const days = questionDays(
    data.logs.map(l => ({ logDate: l.log_date, correct: l.correct, wrong: l.wrong, blank: l.blank, divisor: l.penalty_divisor }))
  ).slice(0, 14)

  if (s.total === 0 && days.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        Analiz için önce birkaç hata ya da soru kaydı gerekiyor.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-3 divide-x rounded-lg border bg-card text-center">
        <Stat k="Toplam hata" v={String(s.total)} />
        <Stat k="Öğrenildi" v={s.learnedPercent === null ? '—' : `%${s.learnedPercent}`} />
        <Stat k="Tekrar başarısı" v={s.reviewSuccessPercent === null ? '—' : `%${s.reviewSuccessPercent}`} />
      </dl>

      {s.reasons.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Hata nedenleri</h3>
          <ul className="space-y-1.5">
            {s.reasons.map(r => (
              <Bar key={r.reason} label={r.label} value={r.count} max={s.reasons[0].count} />
            ))}
          </ul>
          {s.advice && (
            <p className="rounded-md bg-muted/50 p-2 text-sm">
              {audience === 'teacher' ? s.advice.replace('En sık nedenin', 'Öğrencinin en sık nedeni') : s.advice}
            </p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Son 14 gün tekrar</h3>
        <div className="flex h-24 items-end gap-1" role="img" aria-label="Son 14 günün günlük tekrar sayısı">
          {series.map(d => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${shortDay(d.day)}: ${d.total} tekrar, ${d.knew} bildi`}>
              <div className="flex w-full flex-col justify-end" style={{ height: '4.5rem' }}>
                <div className="w-full rounded-sm bg-primary/25" style={{ height: `${(d.total / maxDay) * 100}%` }}>
                  <div className="w-full rounded-sm bg-primary" style={{ height: d.total ? `${(d.knew / d.total) * 100}%` : 0 }} />
                </div>
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground">{Number(d.day.slice(8))}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Koyu kısım “bildim” yanıtları.</p>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <TopList title="Derslere göre" rows={s.bySubject} />
        <TopList title="En çok hata yapılan konular" rows={s.byTopic} />
        <TopList title="Kaynaklara göre" rows={s.bySource} />
        {days.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Günlük soru ve net</h3>
            <ul className="divide-y rounded-lg border bg-card text-sm">
              {days.map(d => (
                <li key={d.day} className="flex justify-between px-3 py-1.5">
                  <span>{shortDay(d.day)}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {d.total} soru · net <span className="font-medium text-foreground">{formatNet(d.net)}</span>
                    {d.accuracy !== null ? ` · %${d.accuracy}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="px-2 py-3">
      <dd className="text-lg font-semibold tabular-nums">{v}</dd>
      <dt className="text-xs text-muted-foreground">{k}</dt>
    </div>
  )
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <li className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2 text-sm">
      <span className="truncate">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${(value / max) * 100}%` }} />
      </span>
      <span className="text-right tabular-nums">{value}</span>
    </li>
  )
}

function TopList({ title, rows }: { title: string; rows: { key: string; count: number }[] }) {
  if (rows.length === 0) return null
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="divide-y rounded-lg border bg-card text-sm">
        {rows.map(r => (
          <li key={r.key} className="flex justify-between gap-3 px-3 py-1.5">
            <span className="truncate">{r.key}</span>
            <span className="tabular-nums text-muted-foreground">{r.count}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
