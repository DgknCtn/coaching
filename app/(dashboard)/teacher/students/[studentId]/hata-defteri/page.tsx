import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { todayDateString } from '@/lib/homework-status'
import { loadMistakeData, loadMistakeFormOptions } from '@/lib/mistakes/load'
import { examTagsFor, formatNet } from '@/lib/mistakes/net'
import { questionDays } from '@/lib/mistakes/analytics'
import { todayStats } from '@/lib/mistakes/today'
import { MetricRow } from '@/components/shared/metric-row'
import { MistakeList } from '@/components/mistakes/mistake-list'
import { MistakeAnalysis } from '@/components/mistakes/mistake-analysis'
import { MistakeForm } from '@/components/mistakes/mistake-form'
import { LogRow } from '@/components/mistakes/question-logger'
import { ModuleUnavailable } from '@/components/mistakes/module-unavailable'
import { cn } from '@/lib/utils'
import { setTeacherNoteAction, teacherCreateMistakeAction, teacherDeleteMistakeAction } from './actions'
import { TargetsForm } from './targets-form'

// ÖĞRENCİNİN HATA DEFTERİ (öğretmen görünümü) — hatalar ve koç notu,
// soru/net kayıtları, analiz ve günlük hedefler. Ödev onayı ve kitap
// ilerlemesiyle BAĞI YOK: buradaki kayıtlar öğrencinin beyanıdır.

export const dynamic = 'force-dynamic'

const TABS = [
  ['hatalar', 'Hatalar'],
  ['soru', 'Soru'],
  ['analiz', 'Analiz'],
  ['hedefler', 'Hedefler'],
  ['ekle', 'Hata ekle'],
] as const
type Tab = (typeof TABS)[number][0]

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' })

export default async function TeacherMistakePage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  searchParams: Promise<{ sekme?: string }>
}) {
  const [{ studentId }, { sekme }] = await Promise.all([params, searchParams])
  const tab: Tab = TABS.some(([k]) => k === sekme) ? (sekme as Tab) : 'hatalar'
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, exam_type')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!student) notFound()

  const today = todayDateString()
  const base = `/teacher/students/${studentId}/hata-defteri`
  const data = await loadMistakeData(supabase, { workspaceId, studentId, days: 60, withPhotos: tab === 'hatalar' })

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
        <h2 className="text-base font-semibold">Hata Defteri</h2>
        <ModuleUnavailable />
      </div>
    )
  }

  const stats = todayStats(data, today)
  const note = setTeacherNoteAction.bind(null, studentId)
  const remove = teacherDeleteMistakeAction.bind(null, studentId)

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <div>
        <h2 className="text-base font-semibold">Hata Defteri</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Öğrencinin yanlış yaptığı sorular, aralıklı tekrarı ve çözdüğü soru sayıları. Koç notunuzu öğrenci tekrar ederken görür.
        </p>
      </div>

      <MetricRow
        className="grid-cols-2 md:grid-cols-4"
        metrics={[
          { label: 'Bekleyen tekrar', value: stats.due },
          { label: 'Tekrarda / öğrenildi', value: `${stats.inReview} / ${stats.learned}` },
          { label: 'Bugün soru', value: stats.questionsToday, subValue: `net ${formatNet(stats.netToday)}` },
          { label: 'Son 7 gün soru', value: stats.questions7d, subValue: stats.accuracy7d !== null ? `%${stats.accuracy7d} doğru` : undefined },
        ]}
      />

      <nav className="flex gap-4 overflow-x-auto border-b text-sm" aria-label="Hata defteri bölümleri">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={k === 'hatalar' ? base : `${base}?sekme=${k}`}
            aria-current={tab === k ? 'page' : undefined}
            className={cn('-mb-px shrink-0 border-b-2 px-1 pb-2', tab === k ? 'border-primary font-medium' : 'border-transparent text-muted-foreground')}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === 'hatalar' && (
        <MistakeList mistakes={data.mistakes} today={today} role="teacher" actions={{ onTeacherNote: note, onDelete: remove }} />
      )}

      {tab === 'soru' &&
        (data.logs.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Öğrenci son 60 günde soru kaydı girmedi.
          </p>
        ) : (
          <div className="space-y-5">
            {questionDays(
              data.logs.map(l => ({ logDate: l.log_date, correct: l.correct, wrong: l.wrong, blank: l.blank, divisor: l.penalty_divisor }))
            ).map(d => (
              <section key={d.day} className="space-y-1.5">
                <h3 className="flex justify-between text-sm font-medium">
                  <span>{shortDay(d.day)}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {d.total} soru · net {formatNet(d.net)}
                    {d.accuracy !== null ? ` · %${d.accuracy}` : ''}
                  </span>
                </h3>
                <ul className="divide-y rounded-lg border bg-card">
                  {data.logs
                    .filter(l => l.log_date === d.day)
                    .map(l => (
                      <LogRow key={l.id} log={l} />
                    ))}
                </ul>
              </section>
            ))}
          </div>
        ))}

      {tab === 'analiz' && <MistakeAnalysis data={data} today={today} audience="teacher" />}

      {tab === 'hedefler' && <TargetsForm studentId={studentId} targets={data.targets} />}

      {tab === 'ekle' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Derste birlikte çözdüğünüz denemeden hata ekleyin. Kayıt öğrencinin defterine “Koçun ekledi” olarak düşer; fotoğraf
            öğrencinin klasörüne yüklenir.
          </p>
          <MistakeForm
            workspaceId={workspaceId}
            studentId={studentId}
            examTags={examTagsFor(student.exam_type)}
            options={await loadMistakeFormOptions(supabase, { workspaceId, studentId })}
            onSubmit={teacherCreateMistakeAction.bind(null, studentId)}
            doneHref={base}
          />
        </div>
      )}
    </div>
  )
}
