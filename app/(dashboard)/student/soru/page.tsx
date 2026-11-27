import { getStudentContext } from '@/lib/workspace'
import { todayDateString } from '@/lib/homework-status'
import { loadMistakeData, loadMistakeFormOptions } from '@/lib/mistakes/load'
import { examTagsFor, formatNet } from '@/lib/mistakes/net'
import { questionDays } from '@/lib/mistakes/analytics'
import { todayStats } from '@/lib/mistakes/today'
import { PageHeader } from '@/components/shared/page-header'
import { MetricRow } from '@/components/shared/metric-row'
import { QuestionLogger } from '@/components/mistakes/question-logger'
import { ModuleUnavailable } from '@/components/mistakes/module-unavailable'
import { deleteQuestionLogAction, logQuestionsAction } from '../hata-defteri/actions'

// SORU TAKİBİM — günlük çözülen soru, net ve doğruluk.

export const dynamic = 'force-dynamic'

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' })

export default async function QuestionLogPage() {
  const { supabase, student, workspaceId } = await getStudentContext()
  const today = todayDateString()
  const [data, options] = await Promise.all([
    loadMistakeData(supabase, { workspaceId, studentId: student.id, days: 30, withPhotos: false }),
    loadMistakeFormOptions(supabase, { workspaceId, studentId: student.id }),
  ])

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <PageHeader title="Soru Takibim" className="mb-0" />
        <ModuleUnavailable />
      </div>
    )
  }

  const stats = todayStats(data, today)
  const history = questionDays(
    data.logs.filter(l => l.log_date !== today).map(l => ({ logDate: l.log_date, correct: l.correct, wrong: l.wrong, blank: l.blank, divisor: l.penalty_divisor }))
  )

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <PageHeader title="Soru Takibim" subtitle="Çözdüğün soruları gir; net ve doğruluk kendiliğinden hesaplanır." className="mb-0" />
      <MetricRow
        metrics={[
          { label: 'Bugün', value: stats.questionsToday, subValue: data.targets.dailyQuestions ? `hedef ${data.targets.dailyQuestions}` : undefined },
          { label: 'Bugünkü net', value: formatNet(stats.netToday) },
          { label: 'Gün serisi', value: stats.dayStreak },
          { label: 'Son 7 gün', value: stats.questions7d, subValue: stats.accuracy7d !== null ? `%${stats.accuracy7d} doğru` : undefined },
        ]}
      />
      <QuestionLogger
        today={today}
        examTags={examTagsFor(student.exam_type)}
        subjects={options.subjects.map(s => ({ id: s.id, name: s.name }))}
        todayLogs={data.logs.filter(l => l.log_date === today)}
        onSubmit={logQuestionsAction}
        onDelete={deleteQuestionLogAction}
      />
      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Son 30 gün</h2>
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {history.map(d => (
              <li key={d.day} className="flex justify-between gap-3 px-3 py-2">
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
  )
}
