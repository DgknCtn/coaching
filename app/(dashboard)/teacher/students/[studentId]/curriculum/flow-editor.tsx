'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  FLOW_STATUS_LABEL,
  deriveFlowStatus,
  durationWeeks,
  insertItem,
  moveItem,
  removeItem,
  resizeItem,
  setPassed,
  summarizeFlow,
  type FlowItem,
  type FlowStatus,
} from '@/lib/curriculum-flow'
import { todayDateString } from '@/lib/homework-status'
import {
  assignCurriculumTemplateAction,
  saveCurriculumFlowAction,
} from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { EmptyState } from '@/components/shared/empty-state'
import { DetailPanel } from '@/components/shared/detail-panel'
import { ExplainerCards, type ExplainerCard } from '@/components/shared/explainer-cards'
import { FlowTimeline } from '@/components/shared/flow-timeline'
import { Legend } from '@/components/shared/legend'
import { CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'

// Müfredat Akışı editörü (R5.2).
//
// Bir TAKVİM UYGULAMASI DEĞİLDİR: öğrencinin ana konu sırasının zaman
// eksenine yerleştirilmiş hâli. Taşıma ve süre değişimi zincirleme etki
// yaratır ve o mantık lib/curriculum-flow.ts'te; burası yalnız çağırır.
//
// Kaydetme "Akışı Kaydet" ile TOPLU yapılır. Her tıklamada sunucuya
// gitmek, zincirleme kaydırmayı yavaş ve yarım kaydedilmiş hâllere açık
// hale getirirdi.

const STATUS_STYLE: Record<FlowStatus, string> = {
  passed: 'bg-success-subtle text-success-foreground border-success-border',
  current: 'bg-info-subtle text-info-foreground border-info-border',
  upcoming: 'bg-muted text-muted-foreground border-border',
}

/** Durum rozeti için Badge varyantı — STATUS_STYLE'ın rozet karşılığı. */
const STATUS_BADGE: Record<FlowStatus, 'success' | 'info' | 'neutral'> = {
  passed: 'success',
  current: 'info',
  upcoming: 'neutral',
}

const LEGEND_ENTRIES = [
  { label: FLOW_STATUS_LABEL.passed, className: 'bg-success-border' },
  { label: FLOW_STATUS_LABEL.current, className: 'bg-info-border' },
  { label: FLOW_STATUS_LABEL.upcoming, className: 'bg-muted-foreground/40' },
]

// Ekranın kuralları, altta tek paragraf yerine madde madde. Metinler
// R5.2'nin davranışını anlatır; bir kuralı değiştirirken buradaki karşılığı
// da güncelleyin.
const EXPLAINERS: ExplainerCard[] = [
  {
    title: 'Müfredat Akışı nasıl çalışır?',
    items: [
      { text: 'Bu akış öğrencinin kişisel akademik yol haritasıdır; genel şablonu etkilemez.' },
      { text: 'Konuyu ileri/geri taşıdığınızda aynı dersteki devam blokları da kayar.' },
      { text: 'Süreyi değiştirdiğinizde takip eden konular otomatik olarak kayar.' },
      { text: 'İstediğiniz yere yeni konu ekleyebilir veya konu çıkarabilirsiniz; geçmiş çalışma silinmez.' },
      { text: 'Değişiklikler "Akışı Kaydet" ile toplu kaydedilir.' },
    ],
  },
  {
    title: 'Renk anlamları',
    description: 'Renk tek başına anlam taşımaz; her blokta konu adı ve durumu da yazar.',
    items: [
      { text: `${FLOW_STATUS_LABEL.passed}: konu "Geçildi" olarak işaretlendi.`, tone: 'positive' },
      { text: `${FLOW_STATUS_LABEL.current}: bugün bu konunun planlanan aralığındasınız.` },
      { text: `${FLOW_STATUS_LABEL.upcoming}: konunun zamanı henüz gelmedi ya da aralığı geçti.` },
    ],
  },
  {
    title: 'Önemli notlar',
    items: [
      { text: 'Müfredat zamanı yalnızca sinyal verir; çalışma ve ödev kararı öğretmenindir.' },
      { text: 'Önden çalışmak için beklemeye gerek yok — istediğiniz konuya ödev verilebilir.' },
      { text: 'Planlanan bitiş tarihinin geçmesi konuyu kendiliğinden "Geçildi" yapmaz.', tone: 'negative' },
      { text: 'Aynı haftaya denk gelen iki konu hata değildir.' },
      { text: 'Müfredat zamanı koruma havuzuna otomatik giriş sağlamaz.', tone: 'negative' },
    ],
  },
]

export interface ScopeOption {
  id: string
  name: string
}

export interface TemplateOption {
  id: string
  name: string
  scopeId: string
  itemCount: number
}

interface Props {
  studentId: string
  scopes: ScopeOption[]
  activeScopeId: string | null
  templates: TemplateOption[]
  initialItems: FlowItem[]
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  })
}

/** Detay panelinde tarih kısaltma yerine tam yazılır: "29 Eylül 2025". */
function formatLongDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function CurriculumFlowEditor({
  studentId,
  scopes,
  activeScopeId,
  templates,
  initialItems,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [items, setItems] = useState<FlowItem[]>(initialItems)
  const [dirty, setDirty] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [templateStart, setTemplateStart] = useState(todayDateString())
  // Seçim yalnız GÖRÜNÜM durumudur: detay panelini açar, veriyi etkilemez.
  // Kaydedilmemiş yeni konuların id'si yoktur; onlar seçilemez.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const today = todayDateString()
  const summary = useMemo(() => summarizeFlow(items, today), [items, today])
  // Silinen/şablonla değişen konu seçili kalmışsa panel kendiliğinden kapanır.
  const selected = selectedId ? (items.find(i => i.id === selectedId) ?? null) : null
  const scopeTemplates = templates.filter(t => t.scopeId === activeScopeId)

  function update(next: FlowItem[]) {
    setItems(next)
    setDirty(true)
  }

  function switchScope(scopeId: string) {
    if (dirty && !window.confirm('Kaydedilmemiş değişiklikler var. Ders değiştirilsin mi?')) {
      return
    }
    router.push(`/teacher/students/${studentId}/curriculum?scope=${scopeId}`)
  }

  function save() {
    if (!activeScopeId) return
    startTransition(async () => {
      const result = await saveCurriculumFlowAction(
        studentId,
        activeScopeId,
        items.map(i => ({
          id: i.id,
          name: i.name,
          start_date: i.startDate,
          end_date: i.endDate,
          passed: i.passed,
          note: i.note,
        }))
      )
      if (result.error) {
        toast.error(result.error)
        return
      }
      setDirty(false)
      toast.success('Akış kaydedildi.')
      router.refresh()
    })
  }

  function applyTemplate() {
    if (!templateId) return
    const varOlan = items.length > 0
    if (
      varOlan &&
      !window.confirm(
        'Bu derste zaten bir akış var. Geçilmemiş konular şablondan yeniden kurulacak; ' +
          'Geçildi işaretli konular korunacak. Devam edilsin mi?'
      )
    ) {
      return
    }

    startTransition(async () => {
      const result = await assignCurriculumTemplateAction(
        studentId,
        templateId,
        templateStart,
        varOlan
      )
      if (result.error) {
        toast.error(result.error)
        return
      }
      setDirty(false)
      toast.success('Şablon uygulandı.')
      router.refresh()
    })
  }

  function addTopic() {
    const name = newTopic.trim()
    if (!name) return
    update(insertItem(items, items.length, name, 1))
    setNewTopic('')
  }

  if (scopes.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={CalendarRange}
          title="Henüz ders/kapsam tanımlı değil"
          description="Müfredat akışı kurmak için önce Müfredat Şablonları ekranından bir ders/kapsam oluşturun."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="scope">Ders / Kapsam</Label>
          <NativeSelect
            id="scope"
            value={activeScopeId ?? ''}
            onChange={e => switchScope(e.target.value)}
            className="min-w-56"
          >
            {scopes.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-warning-foreground">Kaydedilmedi</span>}
          <Button onClick={save} disabled={isPending || !dirty || !activeScopeId}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Akışı Kaydet
          </Button>
        </div>
      </div>

      {/* Şablon opsiyoneldir: akış sıfırdan da kurulabilir. */}
      {scopeTemplates.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
          <div className="space-y-1.5">
            <Label htmlFor="template" className="text-xs">
              Şablondan kur
            </Label>
            <NativeSelect
              id="template"
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              className="min-w-52"
            >
              <option value="">Şablon seçin</option>
              {scopeTemplates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.itemCount} konu)
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="templateStart" className="text-xs">
              Akış başlangıcı
            </Label>
            <Input
              id="templateStart"
              type="date"
              value={templateStart}
              onChange={e => setTemplateStart(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={applyTemplate} disabled={isPending || !templateId}>
            Uygula
          </Button>
          <p className="basis-full text-[11px] text-muted-foreground">
            Şablon uygulandığında öğrenciye ait bağımsız kayıtlar oluşur. Şablon sonradan
            değişirse bu akış kendiliğinden değişmez.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={CalendarRange}
            title="Bu derste henüz akış yok"
            description="Aşağıdan konu ekleyerek ya da bir şablon uygulayarak başlayabilirsiniz."
          />
        </div>
      ) : (
        // Seçili konu varsa masaüstünde sağda detay paneli açılır; `lg` altında
        // panel drawer'a döndüğü için ızgara tek kolon kalır.
        <div
          className={cn(
            'grid gap-4',
            selected && 'lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start'
          )}
        >
          <div className="min-w-0 space-y-3">
            <Legend entries={LEGEND_ENTRIES} />

            {/* Zaman çizelgesi salt görünümdür: tıklamak yalnız seçer.
                Taşıma/süre değişimi satırdaki kontrollerle yapılır — bkz.
                components/shared/flow-timeline.tsx başlığı. */}
            <FlowTimeline
              items={items}
              today={today}
              selectedId={selectedId}
              onSelect={item => setSelectedId(item.id ?? null)}
            />

            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Konu</th>
                    <th className="px-3 py-2 font-medium">Süre</th>
                    <th className="px-3 py-2 font-medium">Başlangıç</th>
                    <th className="px-3 py-2 font-medium">Bitiş</th>
                    <th className="px-3 py-2 font-medium">Durum</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item, index) => {
                    const status = deriveFlowStatus(item, today)
                    const weeks = durationWeeks(item)
                    const key = item.id ?? `yeni-${index}`

                    return (
                      <tr
                        key={key}
                        className={cn(
                          'align-middle',
                          !!item.id && item.id === selectedId && 'bg-muted/50'
                        )}
                      >
                        <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                          {index + 1}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={item.name}
                            onChange={e =>
                              update(
                                items.map((it, i) =>
                                  i === index ? { ...it, name: e.target.value } : it
                                )
                              )
                            }
                            className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm outline-none hover:border-input focus-visible:border-ring"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              max={104}
                              value={weeks}
                              onChange={e =>
                                update(
                                  resizeItem(
                                    items,
                                    item.id ?? '',
                                    Number(e.target.value) || 1
                                  )
                                )
                              }
                              disabled={!item.id}
                              title={
                                item.id
                                  ? undefined
                                  : 'Süreyi değiştirmek için önce akışı kaydedin'
                              }
                              className="h-7 w-14 rounded-md border border-input bg-card px-1.5 text-xs tabular-nums outline-none focus-visible:border-ring disabled:opacity-50"
                            />
                            <span className="text-xs text-muted-foreground">hf</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs tabular-nums">{formatDate(item.startDate)}</td>
                        <td className="px-3 py-2 text-xs tabular-nums">{formatDate(item.endDate)}</td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              'inline-flex rounded-md border px-1.5 py-0.5 text-[11px]',
                              STATUS_STYLE[status]
                            )}
                          >
                            {FLOW_STATUS_LABEL[status]}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-0.5">
                            <IconButton
                              title="1 hafta geri taşı (devamı da kayar)"
                              onClick={() => update(moveItem(items, item.id ?? '', -1))}
                              disabled={!item.id}
                            >
                              <ArrowLeft className="size-3.5" />
                            </IconButton>
                            <IconButton
                              title="1 hafta ileri taşı (devamı da kayar)"
                              onClick={() => update(moveItem(items, item.id ?? '', 1))}
                              disabled={!item.id}
                            >
                              <ArrowRight className="size-3.5" />
                            </IconButton>
                            <IconButton
                              title={item.passed ? 'Geçildi işaretini kaldır' : 'Geçildi yap'}
                              onClick={() => update(setPassed(items, item.id ?? '', !item.passed))}
                              disabled={!item.id}
                              active={item.passed}
                            >
                              <Check className="size-3.5" />
                            </IconButton>
                            <IconButton
                              title="Konuyu akıştan çıkar"
                              onClick={() => {
                                if (window.confirm(`"${item.name}" akıştan çıkarılacak. Geçmiş çalışma silinmez. Devam edilsin mi?`)) {
                                  update(removeItem(items, item.id ?? ''))
                                }
                              }}
                              disabled={!item.id}
                            >
                              <Trash2 className="size-3.5" />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {selected && (
            <DetailPanel
              title={selected.name}
              badge={{
                label: FLOW_STATUS_LABEL[deriveFlowStatus(selected, today)],
                variant: STATUS_BADGE[deriveFlowStatus(selected, today)],
              }}
              rows={[
                { label: 'Planlanan süre', value: `${durationWeeks(selected)} hafta` },
                { label: 'Planlanan başlangıç', value: formatLongDate(selected.startDate) },
                { label: 'Planlanan bitiş', value: formatLongDate(selected.endDate) },
                { label: 'Sıra', value: `${items.indexOf(selected) + 1}. konu` },
                {
                  label: 'Not',
                  value: selected.note ? (
                    selected.note
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
                },
              ]}
              actions={
                <>
                  <Button
                    variant={selected.passed ? 'outline' : 'default'}
                    onClick={() => update(setPassed(items, selected.id ?? '', !selected.passed))}
                  >
                    <Check className="size-4" />
                    {selected.passed ? 'Geçildi işaretini kaldır' : 'Geçildi yap'}
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => update(moveItem(items, selected.id ?? '', -1))}
                    >
                      <ArrowLeft className="size-4" />
                      Geri taşı
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => update(moveItem(items, selected.id ?? '', 1))}
                    >
                      İleri taşı
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Taşıma ve süre değişimi devam bloklarını da kaydırır. Değişiklikler
                    &quot;Akışı Kaydet&quot; ile kaydedilir.
                  </p>
                </>
              }
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="newTopic" className="text-xs">
            Konu ekle
          </Label>
          <Input
            id="newTopic"
            placeholder="Örn: Trigonometri"
            value={newTopic}
            onChange={e => setNewTopic(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTopic()
              }
            }}
          />
        </div>
        <Button variant="outline" onClick={addTopic} disabled={!newTopic.trim()}>
          <Plus className="size-4" />
          Ekle
        </Button>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-card px-4 py-3 text-xs text-muted-foreground">
          <span>
            Toplam <span className="font-medium tabular-nums">{summary.totalWeeks}</span> hafta
          </span>
          <span>Geçildi: {summary.passedWeeks} hf</span>
          <span>Zamanı geldi: {summary.currentWeeks} hf</span>
          <span>Yaklaşıyor: {summary.upcomingWeeks} hf</span>
          {summary.firstStart && summary.lastEnd && (
            <span>
              {formatDate(summary.firstStart)} – {formatDate(summary.lastEnd)}
            </span>
          )}
        </div>
      )}

      <ExplainerCards cards={EXPLAINERS} />
    </div>
  )
}

function IconButton({
  children,
  title,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-30',
        active && 'bg-success-subtle text-success-foreground'
      )}
    >
      {children}
    </button>
  )
}
