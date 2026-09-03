'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Pin, PinOff, Plus, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  POOL_PRIORITY_LABEL,
  activeWorkTopics,
  buildProtectionPool,
  contactAmountLabel,
  contactSourceLabel,
  summarizePool,
  type PoolPriority,
  type PoolRowInput,
} from '@/lib/protection-pool'
import { todayDateString } from '@/lib/homework-status'
import { addTopicContactAction, setTopicKeepActiveAction } from './actions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { EmptyState } from '@/components/shared/empty-state'
import { MetricRow } from '@/components/shared/metric-row'
import { DetailPanel } from '@/components/shared/detail-panel'
import { ExplainerCards, type ExplainerCard } from '@/components/shared/explainer-cards'
import { Legend } from '@/components/shared/legend'
import { LinkTabs } from '@/components/shared/link-tabs'
import { cn } from '@/lib/utils'

// Koruma Havuzu ekranı (R5.4).
//
// UNUTMA RADARI. Zorunlu tekrar eşiği yoktur, sistem test seçmez veya
// ödev atamaz. Sıralama tarihten türetilir; elle yönetilen bir öncelik
// alanı yok — yeni doğrulanmış çalışma geldiğinde konu kendiliğinden
// aşağı iner.

const PRIORITY_STYLE: Record<PoolPriority, string> = {
  priority: 'bg-destructive-subtle text-destructive-foreground border-destructive-border',
  watch: 'bg-warning-subtle text-warning-foreground border-warning-border',
  normal: 'bg-muted text-muted-foreground border-border',
}

const PRIORITY_BADGE: Record<PoolPriority, 'destructive' | 'warning' | 'neutral'> = {
  priority: 'destructive',
  watch: 'warning',
  normal: 'neutral',
}

const LEGEND_ENTRIES = [
  { label: `${POOL_PRIORITY_LABEL.priority} (30+ gün)`, className: 'bg-destructive-border' },
  { label: `${POOL_PRIORITY_LABEL.watch} (14-29 gün)`, className: 'bg-warning-border' },
  { label: `${POOL_PRIORITY_LABEL.normal} (0-13 gün)`, className: 'bg-muted-foreground/40' },
]

// Havuzun üç kuralı: temas ne sayılır, sıra neye göre kurulur, aktif
// çalışmayla ilişkisi nedir. Bunlar ekranın altında tek paragraftı ve
// okunmuyordu; metinler lib/protection-pool.ts'teki davranışı anlatır.
const EXPLAINERS: ExplainerCard[] = [
  {
    title: 'Son temas ne sayılır?',
    description: 'Sıralama yalnız bu olaylardan türetilir.',
    items: [
      { text: 'Öğrencinin tamamladığı ve eğitmenin onayladığı test/sayfa çalışması', tone: 'positive' },
      { text: 'Gerçekleşmiş ve konuya bağlanmış ders', tone: 'positive' },
      { text: 'Öğrencinin kendi çalışmasının eğitmen tarafından doğrulanması', tone: 'positive' },
      { text: 'Ödev verilmesi (henüz çözülmemişse) temas değildir', tone: 'negative' },
      { text: 'Müfredat zamanının gelmesi temas değildir', tone: 'negative' },
      { text: 'Planlanmış ama yapılmamış ders temas değildir', tone: 'negative' },
    ],
  },
  {
    title: 'Sıralama mantığı',
    description: 'Konular son doğrudan temas tarihine göre en eskiden en yeniye sıralanır.',
    items: [
      { text: 'Gün sayısı arttıkça konu listenin üstüne çıkar.' },
      { text: 'Elle yönetilen bir öncelik alanı yoktur; yeni doğrulanmış temas geldiğinde konu kendiliğinden aşağı iner.' },
      { text: 'Renk bandı eşik değildir: hiçbir davranışı tetiklemez, yalnız uzun aralığı görünür kılar.' },
    ],
  },
  {
    title: 'Aktif çalışma ile ilişkisi',
    items: [
      { text: 'Bir konuda açık çalışma varsa konu aktif çalışmadadır ve havuzda gösterilmez.' },
      { text: 'Açık çalışma kalmadığında ve doğrulanmış geçmiş temas varsa konu havuzda görünür.' },
      { text: 'Yeni çalışma verildiğinde konu tekrar aktif çalışma durumuna geçer.' },
      { text: '"Aktif tut" ile bir konuyu havuz dışında manuel olarak tutabilirsiniz.' },
      { text: 'Koruma Havuzu bir tekrar programı değildir: sistem test seçmez, ödev atamaz. Tekrar kararını siz verirsiniz.' },
    ],
  },
]

export interface ScopeTab {
  id: string
  name: string
}

interface Props {
  studentId: string
  scopes: ScopeTab[]
  activeScopeId: string | null
  rows: PoolRowInput[]
}

export function ProtectionPoolClient({ studentId, scopes, activeScopeId, rows }: Props) {
  const router = useRouter()
  const today = todayDateString()

  const pool = useMemo(() => buildProtectionPool(rows, today), [rows, today])
  const active = useMemo(() => activeWorkTopics(rows), [rows])
  const summary = useMemo(() => summarizePool(rows, pool), [rows, pool])

  // Seçim görünüm durumudur. Konu havuzdan çıkarsa (yeni temas geldi,
  // "Aktif tut" işaretlendi) panel kendiliğinden kapanır.
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
  const selected = selectedTopicId
    ? (pool.find(r => r.topicId === selectedTopicId) ?? null)
    : null

  if (scopes.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={ShieldCheck}
          title="Bu öğrenci için izlenen ders yok"
          description="Koruma Havuzu kendi ders listesini tutmaz; öğrencinin müfredat akışındaki derslerden beslenir. Önce Akış ekranından bir ders akışı kurun."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <LinkTabs
        tabs={scopes.map(scope => ({
          key: scope.id,
          label: scope.name,
          href: `/teacher/students/${studentId}/protection?scope=${scope.id}`,
        }))}
        activeKey={activeScopeId ?? ''}
      />

      <MetricRow
        className="md:grid-cols-3 xl:grid-cols-5"
        metrics={[
          { label: 'İzlenen konu', value: summary.trackedTopics },
          { label: 'Havuzdaki konu', value: summary.inPool },
          { label: '30 günden fazla', value: summary.overThirtyDays },
          {
            label: 'En uzun temas',
            value: summary.longestDays === null ? '—' : `${summary.longestDays} gün`,
            hint: summary.longestTopicName ?? undefined,
          },
          {
            label: 'Ortalama temas süresi',
            value: summary.averageDays === null ? '—' : `${summary.averageDays} gün`,
            hint: 'Havuzdaki konuların ortalaması',
          },
        ]}
      />

      {pool.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={ShieldCheck}
            title="Havuzda konu yok"
            description="Bu derste henüz doğrulanmış çalışma yok ya da tüm konular aktif çalışmada. Koruma Havuzu yalnız daha önce gerçekten çalışılmış konuları listeler."
          />
        </div>
      ) : (
        <div
          className={cn(
            'grid gap-4',
            selected && 'lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start'
          )}
        >
          <div className="min-w-0 space-y-3">
            <Legend entries={LEGEND_ENTRIES} />

            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Konu</th>
                    <th className="px-3 py-2 font-medium">Son temas</th>
                    <th className="px-3 py-2 font-medium">Üzerinden</th>
                    <th className="px-3 py-2 font-medium">Kaynak</th>
                    <th className="px-3 py-2 font-medium">Durum</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pool.map((r, index) => (
                    <tr
                      key={r.topicId}
                      className={cn(r.topicId === selectedTopicId && 'bg-muted/50')}
                    >
                      <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                        {index + 1}
                      </td>
                      <td className="px-3 py-2">
                        {/* Konu adı detay panelini açar; satırın tamamı tıklanabilir
                            değil, çünkü sağdaki "Aktif tut" ayrı bir eylemdir. */}
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedTopicId(current =>
                              current === r.topicId ? null : r.topicId
                            )
                          }
                          className="rounded text-left text-sm hover:underline"
                        >
                          {r.topicName}
                        </button>
                        {r.bookTitles.length > 0 && (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {r.bookTitles.join(' · ')}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums">
                        {new Date(`${r.lastContactDate}T00:00:00Z`).toLocaleDateString('tr-TR')}
                        {contactAmountLabel(r) && (
                          <span className="ml-1 text-muted-foreground">· {contactAmountLabel(r)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm tabular-nums">{r.daysSinceContact} gün</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {contactSourceLabel(r.lastContactSource)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'inline-flex rounded-md border px-1.5 py-0.5 text-[11px]',
                            PRIORITY_STYLE[r.priority]
                          )}
                        >
                          {POOL_PRIORITY_LABEL[r.priority]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <KeepActiveButton
                          studentId={studentId}
                          topicId={r.topicId}
                          keepActive={false}
                          onDone={() => router.refresh()}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selected && (
            <DetailPanel
              title={selected.topicName}
              badge={{
                label: POOL_PRIORITY_LABEL[selected.priority],
                variant: PRIORITY_BADGE[selected.priority],
              }}
              rows={[
                {
                  label: 'Son temas tarihi',
                  value: new Date(`${selected.lastContactDate}T00:00:00Z`).toLocaleDateString(
                    'tr-TR',
                    { day: 'numeric', month: 'long', year: 'numeric' }
                  ),
                },
                { label: 'Son temas üzerinden', value: `${selected.daysSinceContact} gün` },
                {
                  label: 'Son temasta yapılan',
                  value: contactAmountLabel(selected) || '—',
                },
                {
                  label: 'Son temasın türü',
                  value: contactSourceLabel(selected.lastContactSource),
                },
                {
                  label: 'Çalışılan kaynaklar',
                  value:
                    selected.bookTitles.length > 0 ? (
                      selected.bookTitles.join(' · ')
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    ),
                },
              ]}
              actions={
                <>
                  <Link
                    href={`/teacher/students/${studentId}/homework/new`}
                    className={buttonVariants()}
                  >
                    <Plus className="size-4" />
                    Bu konu için çalışma ver
                  </Link>
                  <p className="text-[11px] text-muted-foreground">
                    Tekrar kararını sistem değil siz verirsiniz. Havuz yalnızca uzun
                    aralıkları görünür kılar.
                  </p>
                </>
              }
              onClose={() => setSelectedTopicId(null)}
            />
          )}
        </div>
      )}

      {active.length > 0 && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-medium">Aktif çalışmadaki konular</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bu konularda açık çalışma var; radar zaten üstlerinde olduğu için havuzda
            listelenmezler. Çalışma kapandığında geçmiş temas varsa havuzda görünürler.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {active.map(r => (
              <li
                key={r.topicId}
                className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
              >
                {r.topicName}
                {r.keepActive && (
                  <KeepActiveButton
                    studentId={studentId}
                    topicId={r.topicId}
                    keepActive
                    onDone={() => router.refresh()}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AddContactForm
        studentId={studentId}
        topics={rows.map(r => ({ id: r.topicId, name: r.topicName }))}
      />

      <ExplainerCards cards={EXPLAINERS} />
    </div>
  )
}

function KeepActiveButton({
  studentId,
  topicId,
  keepActive,
  onDone,
}: {
  studentId: string
  topicId: string
  keepActive: boolean
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      title={keepActive ? 'Aktif tutmayı bırak' : 'Aktif tut (havuzdan çıkar)'}
      aria-label={keepActive ? 'Aktif tutmayı bırak' : 'Aktif tut'}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await setTopicKeepActiveAction(studentId, topicId, !keepActive)
          if (result.error) toast.error(result.error)
          else onDone()
        })
      }
      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
    >
      {isPending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : keepActive ? (
        <PinOff className="size-3.5" />
      ) : (
        <Pin className="size-3.5" />
      )}
    </button>
  )
}

function AddContactForm({
  studentId,
  topics,
}: {
  studentId: string
  topics: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [topicId, setTopicId] = useState('')
  const [kind, setKind] = useState<'lesson' | 'self_study'>('lesson')
  const [activityDate, setActivityDate] = useState(todayDateString())
  const [amountNote, setAmountNote] = useState('')

  if (topics.length === 0) return null

  function submit() {
    if (!topicId) return
    startTransition(async () => {
      const result = await addTopicContactAction(
        studentId,
        topicId,
        kind,
        activityDate,
        amountNote
      )
      if (result.error) {
        toast.error(result.error)
        return
      }
      setTopicId('')
      setAmountNote('')
      toast.success('Temas kaydedildi.')
      router.refresh()
    })
  }

  return (
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-medium">Temas ekle</h2>
      <p className="text-xs text-muted-foreground">
        Onaylı test/sayfa çalışması buraya girilmez — o kendiliğinden sayılır. Bu form
        yalnız sistemde karşılığı olmayan iki olay için: gerçekleşmiş ders ve öğrencinin
        sizin doğruladığınız kendi çalışması. Planlanmış ama yapılmamış ders girilmez.
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="contactTopic" className="text-xs">
            Konu
          </Label>
          <NativeSelect
            id="contactTopic"
            value={topicId}
            onChange={e => setTopicId(e.target.value)}
          >
            <option value="">Konu seçin</option>
            {topics.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactKind" className="text-xs">
            Tür
          </Label>
          <NativeSelect
            id="contactKind"
            value={kind}
            onChange={e => setKind(e.target.value as 'lesson' | 'self_study')}
          >
            <option value="lesson">Ders</option>
            <option value="self_study">Kendi çalışması</option>
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactDate" className="text-xs">
            Gerçekleşme günü
          </Label>
          <Input
            id="contactDate"
            type="date"
            value={activityDate}
            max={todayDateString()}
            onChange={e => setActivityDate(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactAmount" className="text-xs">
            Miktar <span className="text-muted-foreground">(isteğe bağlı)</span>
          </Label>
          <Input
            id="contactAmount"
            placeholder="ör. 2 test, 40 dk"
            value={amountNote}
            onChange={e => setAmountNote(e.target.value)}
          />
        </div>
      </div>

      <Button size="sm" onClick={submit} disabled={isPending || !topicId}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Temas ekle
      </Button>
    </section>
  )
}
