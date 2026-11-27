import Link from 'next/link'
import { Repeat2 } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { todayDateString } from '@/lib/homework-status'
import { addDays } from '@/lib/mistakes/srs'
import { daysSince, todayStats } from '@/lib/mistakes/today'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { MetricRow } from '@/components/shared/metric-row'
import { EmptyState } from '@/components/shared/empty-state'
import { ModuleUnavailable } from '@/components/mistakes/module-unavailable'
import { cn } from '@/lib/utils'

// SORU & HATA TAKİBİ — tüm öğrenciler tek tabloda: bugün/7 gün soru,
// doğruluk, bekleyen tekrar, açık hata, son etkinlik. Mevcut öğrenci
// durumu hesabına (student-status) DOKUNMAZ; ayrı bir görünümdür.

export const dynamic = 'force-dynamic'

const QUIET_DAYS = 3

export default async function MistakeOverviewPage({ searchParams }: { searchParams: Promise<{ sessiz?: string }> }) {
  const { sessiz } = await searchParams
  const onlyQuiet = sessiz === '1'
  const { supabase, workspaceId } = await getTeacherContext()
  const today = todayDateString()
  const since = addDays(today, -13)

  const [{ data: students }, mistakesRes, reviewsRes, logsRes] = await Promise.all([
    supabase.from('students').select('id, full_name').eq('workspace_id', workspaceId).eq('status', 'active').order('full_name'),
    supabase.from('mistakes').select('student_id, status, next_review_on').eq('workspace_id', workspaceId).neq('status', 'archived').limit(50000),
    supabase.from('mistake_reviews').select('student_id, reviewed_at, result').eq('workspace_id', workspaceId).gte('reviewed_at', `${since}T00:00:00Z`).limit(50000),
    supabase
      .from('question_logs')
      .select('student_id, log_date, correct, wrong, blank, penalty_divisor')
      .eq('workspace_id', workspaceId)
      .gte('log_date', since)
      .limit(50000),
  ])

  if (mistakesRes.error || reviewsRes.error || logsRes.error) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
        <PageHeader title="Soru & Hata Takibi" className="mb-0" />
        <ModuleUnavailable />
      </div>
    )
  }

  const group = <T extends { student_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>()
    for (const r of rows) m.set(r.student_id, [...(m.get(r.student_id) ?? []), r])
    return m
  }
  const mistakes = group(mistakesRes.data ?? [])
  const reviews = group((reviewsRes.data ?? []) as { student_id: string; reviewed_at: string; result: 'knew' | 'missed' }[])
  const logs = group(logsRes.data ?? [])

  const rows = ((students ?? []) as { id: string; full_name: string }[]).map(s => {
    const stats = todayStats(
      {
        mistakes: mistakes.get(s.id) ?? [],
        reviews: (reviews.get(s.id) ?? []).map(r => ({ reviewedAt: r.reviewed_at, result: r.result })),
        logs: logs.get(s.id) ?? [],
      },
      today
    )
    return { ...s, stats, idle: daysSince(stats.lastActivity, today) }
  })
  const quiet = rows.filter(r => r.idle === null || r.idle >= QUIET_DAYS)
  const shown = onlyQuiet ? quiet : rows

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Soru & Hata Takibi"
        subtitle="Öğrencilerin hata defteri ve soru çözümü tek tabloda. Bu kayıtlar öğrencinin beyanıdır; ödev onayını etkilemez."
        className="mb-0"
      />
      <MetricRow
        className="grid-cols-2 md:grid-cols-4"
        metrics={[
          { label: 'Öğrenci', value: rows.length, href: '/teacher/hata-defteri' },
          { label: 'Bugün aktif', value: rows.filter(r => r.idle === 0).length },
          { label: 'Tekrarı birikenler', value: rows.filter(r => r.stats.due >= 10).length, hint: '10+ bekleyen tekrar' },
          { label: `${QUIET_DAYS}+ gündür kayıt yok`, value: quiet.length, href: '/teacher/hata-defteri?sessiz=1' },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState icon={Repeat2} title="Aktif öğrenci yok" />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Öğrenci</th>
                <th className="px-3 py-2 text-right font-medium">Bugün soru</th>
                <th className="px-3 py-2 text-right font-medium">7 gün soru</th>
                <th className="px-3 py-2 text-right font-medium">Doğruluk (7 gün)</th>
                <th className="px-3 py-2 text-right font-medium">Bekleyen tekrar</th>
                <th className="px-3 py-2 text-right font-medium">Açık hata</th>
                <th className="px-3 py-2 font-medium">Son etkinlik</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map(r => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <Link href={`/teacher/students/${r.id}/hata-defteri`} className="font-medium hover:underline">
                      {r.full_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.stats.questionsToday}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.stats.questions7d}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.stats.accuracy7d === null ? '—' : `%${r.stats.accuracy7d}`}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', r.stats.due >= 10 && 'font-semibold text-warning')}>{r.stats.due}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.stats.inReview}</td>
                  <td className="px-3 py-2">
                    <IdleBadge idle={r.idle} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {onlyQuiet && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Yalnız {QUIET_DAYS}+ gündür kayıt girmeyenler gösteriliyor.{' '}
              <Link href="/teacher/hata-defteri" className="underline">
                Tümünü göster
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function IdleBadge({ idle }: { idle: number | null }) {
  if (idle === null) return <Badge variant="neutral">Henüz kayıt yok</Badge>
  if (idle === 0) return <Badge variant="success">Bugün aktif</Badge>
  if (idle === 1) return <Badge variant="neutral">Dün</Badge>
  if (idle >= 13) return <Badge variant="warning">2+ haftadır yok</Badge>
  return <Badge variant={idle >= QUIET_DAYS ? 'warning' : 'neutral'}>{idle} gündür yok</Badge>
}
