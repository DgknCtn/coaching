import { CalendarRange } from 'lucide-react'
import { getStudentContext } from '@/lib/workspace'
import { loadOpenWorkTopicIds } from '@/lib/open-work'
import {
  FLOW_STATUS_LABEL,
  deriveFlowStatuses,
  durationWeeks,
  flowItemKey,
  summarizeFlow,
  type FlowItem,
  type FlowStatus,
} from '@/lib/curriculum-flow'
import { todayDateString } from '@/lib/homework-status'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { ExplainerCards, type ExplainerCard } from '@/components/shared/explainer-cards'
import { FlowTimeline } from '@/components/shared/flow-timeline'
import { Legend } from '@/components/shared/legend'
import { LinkTabs } from '@/components/shared/link-tabs'
import { cn } from '@/lib/utils'

// Öğrencinin kendi akışı — SALT GÖRÜNÜM.
//
// Neden var: öğrenci bugüne kadar yalnız "bu hafta ne yapacağım"ı
// görüyordu; "şu an hangi konudayız, sırada ne var" sorusunun karşılığı
// yoktu. Denetimde çıkan asimetri buydu — öğrencinin velisi haftalık
// özetini görebiliyor, öğrenci kendi akademik planını göremiyordu.
//
// ÖĞRETMEN EKRANIYLA AYNI VERİ, AYNI TÜRETME: deriveFlowStatuses ve
// lib/open-work.ts. İki ekranın farklı şey söylemesi (birinde "İşleniyor",
// diğerinde "Zamanı Geldi") kabul edilemez.
//
// DÜZENLEME YOK: FlowTimeline'a onChange verilmez → sürükleme kapalı;
// satır menüsü, taşıma, süre kontrolü hiç render edilmez. Akış eğitmenin
// planıdır (R5.2 §4.4); öğrenci onu okur, değiştirmez. RLS de yalnız
// SELECT veriyor (046) — arayüz o sınırın aynısını çiziyor.

export const dynamic = 'force-dynamic'

type Nested<T> = T | T[] | null
function one<T>(value: Nested<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

const STATUS_DOT: Record<FlowStatus, string> = {
  passed: 'bg-success-border',
  in_progress: 'bg-info-border',
  current: 'bg-primary',
  soon: 'bg-warning-border',
  later: 'bg-muted-foreground/40',
}

const STATUS_ORDER: FlowStatus[] = ['passed', 'in_progress', 'current', 'soon', 'later']

const LEGEND_ENTRIES = STATUS_ORDER.map(status => ({
  label: FLOW_STATUS_LABEL[status],
  className: STATUS_DOT[status],
}))

// Öğretmen ekranındaki kartların ÖĞRENCİ diliyle yazılmış hâli. Aynı
// kuralları anlatır; "öğretmenindir" denen kararlar burada "senin
// değil" diye değil, "öğretmenin planlar" diye ifade edilir.
const EXPLAINERS: ExplainerCard[] = [
  {
    title: 'Bu ekran ne gösteriyor?',
    items: [
      { text: 'Öğretmeninin senin için kurduğu konu sırası ve her konunun planlanan zamanı.' },
      { text: 'Sadece görüntüleme: buradan bir şey değiştiremezsin, değişiklikleri öğretmenin yapar.' },
      { text: 'Sıradaki konuyu görmek, neye hazırlanacağını önceden bilmeni sağlar.' },
    ],
  },
  {
    title: 'Renk anlamları',
    description: 'Renk tek başına anlam taşımaz; her satırda durumun adı da yazar.',
    items: [
      { text: `${FLOW_STATUS_LABEL.passed}: öğretmenin bu konuyu tamamlanmış işaretledi.`, tone: 'positive' },
      { text: `${FLOW_STATUS_LABEL.in_progress}: bu konuda şu an açık bir çalışman var.` },
      { text: `${FLOW_STATUS_LABEL.current}: planlanan zamanı geldi.` },
      { text: `${FLOW_STATUS_LABEL.soon}: sırada bu konu var.` },
      { text: `${FLOW_STATUS_LABEL.later}: zamanı daha sonra gelecek.` },
    ],
  },
  {
    title: 'Bilmen gerekenler',
    items: [
      { text: 'Önden çalışmak için beklemene gerek yok; zamanı gelmemiş bir konuya da çalışabilirsin.' },
      { text: 'Planlanan bitiş tarihinin geçmesi konuyu kendiliğinden tamamlamaz.', tone: 'negative' },
      { text: 'Aynı haftaya denk gelen iki konu hata değildir.' },
      { text: 'Tarihler plandır, söz değildir; öğretmenin gerektiğinde kaydırır.' },
    ],
  },
]

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  })
}

export default async function StudentCurriculumPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>
}) {
  const { scope: rawScope } = await searchParams
  const { supabase, student, workspaceId } = await getStudentContext()

  // 046 sayesinde öğrenci kendi satırlarını okuyabiliyor; RLS zaten
  // başkasının akışını süzüyor, ayrıca student_id ile de filtreleniyor.
  const { data: itemRows } = await supabase
    .from('student_curriculum_items')
    .select('id, topic_id, scope_id, start_date, end_date, passed_at, note, topics(name), academic_scopes(name)')
    .eq('student_id', student.id)
    .eq('workspace_id', workspaceId)
    .order('sort_order')

  type Row = {
    id: string
    topic_id: string
    scope_id: string
    start_date: string
    end_date: string
    passed_at: string | null
    note: string | null
    topics: Nested<{ name: string }>
    academic_scopes: Nested<{ name: string }>
  }

  const rows = (itemRows ?? []) as unknown as Row[]

  const scopeMap = new Map<string, string>()
  for (const row of rows) {
    if (!scopeMap.has(row.scope_id)) {
      scopeMap.set(row.scope_id, one(row.academic_scopes)?.name ?? 'Ders')
    }
  }
  const scopes = [...scopeMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))

  // Geçersiz ?scope= sessizce ilk derse düşer.
  const activeScopeId =
    rawScope && scopes.some(s => s.id === rawScope) ? rawScope : (scopes[0]?.id ?? null)

  const items: FlowItem[] = rows
    .filter(r => r.scope_id === activeScopeId)
    .map(r => ({
      id: r.id,
      topicId: r.topic_id,
      name: one(r.topics)?.name ?? 'Konu',
      startDate: r.start_date,
      endDate: r.end_date,
      passed: r.passed_at !== null,
      note: r.note,
    }))

  const openWorkTopicIds = await loadOpenWorkTopicIds(supabase, {
    workspaceId,
    studentId: student.id,
    topicIds: items.map(i => i.topicId).filter((t): t is string => !!t),
  })

  const today = todayDateString()
  const statuses = deriveFlowStatuses(items, today, openWorkTopicIds)
  const summary = summarizeFlow(items, statuses)

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Akışım"
        subtitle="Öğretmeninin senin için kurduğu konu planı. Şu an neredesin, sırada ne var?"
      />

      {items.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={CalendarRange}
            title="Henüz bir akış yok"
            description="Öğretmenin senin için bir konu planı kurduğunda burada görünecek."
          />
        </div>
      ) : (
        <>
          {scopes.length > 1 && (
            <LinkTabs
              tabs={scopes.map(s => ({
                key: s.id,
                label: s.name,
                href: `/student/curriculum?scope=${s.id}`,
              }))}
              activeKey={activeScopeId ?? ''}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Legend entries={LEGEND_ENTRIES} />
            <p className="text-xs tabular-nums text-muted-foreground">
              Toplam {summary.totalWeeks} hafta
              {summary.firstStart && summary.lastEnd && (
                <span className="ml-1">
                  · {formatDate(summary.firstStart)} – {formatDate(summary.lastEnd)}
                </span>
              )}
            </p>
          </div>

          {/* onChange YOK: sürükleme ve düzenleme kapalı. */}
          <FlowTimeline items={items} today={today} statuses={statuses} />

          {/* Tablo yerine sade liste: öğrenci düzenleme yapmıyor, bu yüzden
              süre/tarih girdisi ve satır menüsü gerekmiyor. */}
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {items.map((item, index) => {
              const status = statuses.get(flowItemKey(item, index)) ?? 'later'
              return (
                <li
                  key={item.id ?? index}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[status])}
                    />
                    <span className="truncate text-sm">{item.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {FLOW_STATUS_LABEL[status]}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatDate(item.startDate)} – {formatDate(item.endDate)} ·{' '}
                    {durationWeeks(item)} hf
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <ExplainerCards cards={EXPLAINERS} />
    </div>
  )
}
