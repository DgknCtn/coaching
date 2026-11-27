import Link from 'next/link'
import { NotebookPen, Repeat2 } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ProgressBar } from '@/components/shared/progress-bar'
import { formatNet } from '@/lib/mistakes/net'
import type { StudyTargets } from '@/lib/mistakes/load'
import type { todayStats } from '@/lib/mistakes/today'

// ÖĞRENCİ ANA SAYFASI — "Bugün" kartı. Mevcut ödev listesinin ÜSTÜNE
// eklenir; ödev akışına dokunmaz. Hedefleri koç belirler.

type Stats = ReturnType<typeof todayStats>

const weekday = (d: string, i: number) =>
  i === 0 ? 'Bugün' : new Date(`${d}T12:00:00Z`).toLocaleDateString('tr-TR', { weekday: 'short', timeZone: 'UTC' })

export function TodayCard({ stats, targets }: { stats: Stats; targets: StudyTargets }) {
  return (
    <section aria-label="Bugünün çalışması" className="grid gap-3 md:grid-cols-2">
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Soru tekrarı</p>
            <p className="mt-1 text-sm">
              <span className="text-2xl font-semibold tabular-nums">{stats.due}</span> soru seni bekliyor
            </p>
          </div>
          <Repeat2 className="size-5 text-muted-foreground" />
        </div>
        {targets.dailyReviews > 0 && (
          <div className="space-y-1">
            <ProgressBar value={(stats.reviewsToday / targets.dailyReviews) * 100} />
            <p className="text-xs text-muted-foreground">
              Bugün {stats.reviewsToday} tekrar · hedef {targets.dailyReviews}
              {stats.reviewStreak > 1 ? ` · ${stats.reviewStreak} gün seri` : ''}
            </p>
          </div>
        )}
        <ol className="grid grid-cols-7 gap-1 text-center" aria-label="Önümüzdeki 7 günün tekrarları">
          {stats.week.map((d, i) => (
            <li key={d.day} className="rounded-md bg-muted/50 py-1">
              <span className="block text-sm font-medium tabular-nums">{d.count}</span>
              <span className="block text-[10px] text-muted-foreground">{weekday(d.day, i)}</span>
            </li>
          ))}
        </ol>
        <div className="flex gap-2">
          <Link
            href="/student/hata-defteri/tekrar"
            className={cn(buttonVariants({ size: 'sm', variant: stats.due ? 'default' : 'outline' }), 'flex-1')}
          >
            {stats.due ? `Tekrara başla (${stats.due})` : 'Bugünkü tekrar bitti'}
          </Link>
          <Link href="/student/hata-defteri/yeni" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            Hata ekle
          </Link>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Bugünün soru çözümü</p>
            <p className="mt-1 text-sm">
              <span className="text-2xl font-semibold tabular-nums">{stats.questionsToday}</span>
              {targets.dailyQuestions > 0 ? ` / ${targets.dailyQuestions} soru` : ' soru'}
            </p>
          </div>
          <NotebookPen className="size-5 text-muted-foreground" />
        </div>
        {targets.dailyQuestions > 0 && <ProgressBar value={(stats.questionsToday / targets.dailyQuestions) * 100} />}
        <dl className="grid grid-cols-4 gap-2 text-center">
          <Mini k="Net" v={formatNet(stats.netToday)} />
          <Mini k="Doğruluk" v={stats.accuracyToday === null ? '—' : `%${stats.accuracyToday}`} />
          <Mini k="Gün seri" v={String(stats.dayStreak)} />
          <Mini k="7 gün" v={String(stats.questions7d)} />
        </dl>
        <Link href="/student/soru" className={buttonVariants({ size: 'sm', variant: 'outline', className: 'w-full' })}>
          Soru çözümü ekle
        </Link>
      </div>
    </section>
  )
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-muted/50 py-1.5">
      <dd className="text-sm font-semibold tabular-nums">{v}</dd>
      <dt className="text-[10px] text-muted-foreground">{k}</dt>
    </div>
  )
}
