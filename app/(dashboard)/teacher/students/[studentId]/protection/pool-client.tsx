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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { EmptyState } from '@/components/shared/empty-state'
import { MetricRow } from '@/components/shared/metric-row'
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
      <nav className="flex flex-wrap gap-2">
        {scopes.map(scope => (
          <Link
            key={scope.id}
            href={`/teacher/students/${studentId}/protection?scope=${scope.id}`}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm transition-colors',
              scope.id === activeScopeId
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {scope.name}
          </Link>
        ))}
      </nav>

      <MetricRow
        className="md:grid-cols-4"
        metrics={[
          { label: 'İzlenen konu', value: summary.trackedTopics },
          { label: 'Havuzdaki konu', value: summary.inPool },
          { label: '30 günden fazla', value: summary.overThirtyDays },
          {
            label: 'En uzun temas',
            value: summary.longestDays === null ? '—' : `${summary.longestDays} gün`,
            hint: summary.longestTopicName ?? undefined,
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
                <tr key={r.topicId}>
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-sm">{r.topicName}</p>
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

      <p className="text-xs text-muted-foreground">
        Koruma Havuzu bir tekrar programı değildir. Zorunlu tekrar aralığı yoktur; sistem
        test seçmez veya ödev atamaz. Tekrar kararını siz verirsiniz. Bir test bile temas
        sayılır; miktar yalnız yorum içindir.
      </p>
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
