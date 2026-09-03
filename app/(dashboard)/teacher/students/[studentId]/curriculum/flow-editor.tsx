'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Combine,
  Loader2,
  MoreVertical,
  Plus,
  Save,
  SplitSquareHorizontal,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  FLOW_STATUS_LABEL,
  deriveFlowStatuses,
  durationWeeks,
  flowItemKey,
  mergeWithNext,
  insertItem,
  moveItem,
  removeItem,
  resizeItem,
  setPassed,
  splitItem,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

/** Durum noktası — tabloda konu adının başında (referans tasarım). */
const STATUS_DOT: Record<FlowStatus, string> = {
  passed: 'bg-success-border',
  in_progress: 'bg-info-border',
  current: 'bg-primary',
  soon: 'bg-warning-border',
  later: 'bg-muted-foreground/40',
}

/** Durum rozeti için Badge varyantı — STATUS_DOT'un rozet karşılığı. */
const STATUS_BADGE: Record<FlowStatus, 'success' | 'info' | 'warning' | 'neutral'> = {
  passed: 'success',
  in_progress: 'info',
  current: 'info',
  soon: 'warning',
  later: 'neutral',
}

const STATUS_ORDER: FlowStatus[] = ['passed', 'in_progress', 'current', 'soon', 'later']

const LEGEND_ENTRIES = STATUS_ORDER.map(status => ({
  label: FLOW_STATUS_LABEL[status],
  className: STATUS_DOT[status],
}))

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
      { text: 'Çizelgede blokları sürükleyerek taşıyabilir, sağ kenarından süreyi değiştirebilirsiniz.' },
      { text: 'Bir konuyu ikiye bölebilir ya da sonrakiyle birleştirebilirsiniz; toplam aralık değişmez.' },
      { text: 'İstediğiniz yere yeni konu ekleyebilir veya konu çıkarabilirsiniz; geçmiş çalışma silinmez.' },
      { text: 'Değişiklikler "Akışı Kaydet" ile toplu kaydedilir.' },
    ],
  },
  {
    title: 'Renk anlamları',
    description: 'Renk tek başına anlam taşımaz; her blokta konu adı ve durumu da yazar.',
    items: [
      { text: `${FLOW_STATUS_LABEL.passed}: konu tamamlandı olarak işaretlendi.`, tone: 'positive' },
      {
        text: `${FLOW_STATUS_LABEL.in_progress}: konuda açık çalışma var. Tarihten bağımsızdır — öğrenci planın önünde olabilir.`,
      },
      { text: `${FLOW_STATUS_LABEL.current}: bugün bu konunun planlanan aralığındasınız.` },
      { text: `${FLOW_STATUS_LABEL.soon}: başlamamış konulardan sıradaki ilki. Her akışta tek satır.` },
      { text: `${FLOW_STATUS_LABEL.later}: konunun zamanı daha sonra gelecek.` },
    ],
  },
  {
    title: 'Önemli notlar',
    items: [
      { text: 'Müfredat zamanı yalnızca sinyal verir; çalışma ve ödev kararı öğretmenindir.' },
      { text: 'Önden çalışmak için beklemeye gerek yok — istediğiniz konuya ödev verilebilir.' },
      { text: 'Planlanan bitiş tarihinin geçmesi konuyu kendiliğinden "Tamamlandı" yapmaz.', tone: 'negative' },
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
  /** Açık çalışması olan konular — "İşleniyor" durumu (lib/open-work.ts). */
  openWorkTopicIds: string[]
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Bugün konunun kaçıncı haftasında? Aralık dışındaysa null.
 * Hafta 1'den başlar: başlangıç günü "1. hafta"dır.
 */
function weekWithin(item: FlowItem, today: string): number | null {
  if (today < item.startDate || today > item.endDate) return null
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${item.startDate}T00:00:00Z`)
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) + 1
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
  openWorkTopicIds,
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
  const activeTopicIds = useMemo(() => new Set(openWorkTopicIds), [openWorkTopicIds])
  // Durum haritası TEK yerde üretilir; çizelge, tablo, panel ve özet aynı
  // haritadan okur — biri "İşleniyor" derken diğeri "Zamanı Geldi" diyemez.
  const statuses = useMemo(
    () => deriveFlowStatuses(items, today, activeTopicIds),
    [items, today, activeTopicIds]
  )
  const summary = useMemo(() => summarizeFlow(items, statuses), [items, statuses])
  // Silinen/şablonla değişen konu seçili kalmışsa panel kendiliğinden kapanır.
  const selectedIndex = selectedId ? items.findIndex(i => i.id === selectedId) : -1
  const selected = selectedIndex === -1 ? null : items[selectedIndex]
  const selectedStatus: FlowStatus =
    selected ? (statuses.get(flowItemKey(selected, selectedIndex)) ?? 'later') : 'later'

  // "Bu hafta" ve "İlerleme": konunun kendi aralığında bugün neredeyiz?
  // Aralık dışındaysa (henüz başlamadı ya da bitti) null döner — uydurma
  // bir hafta numarası göstermek yanıltıcı olurdu.
  const selectedWeek = selected ? weekWithin(selected, today) : null
  const selectedProgress =
    selected && selectedWeek !== null
      ? Math.min(100, Math.round(((selectedWeek - 1) / durationWeeks(selected)) * 100))
      : selected?.passed
        ? 100
        : 0
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

        <div className="flex items-center gap-3">
          {/* Toplam süre başlık şeridinde: "bu akış ne kadar sürüyor?"
              sorusu ekranı aşağı kaydırmadan yanıtlanmalı. */}
          {items.length > 0 && (
            <div className="rounded-lg border bg-card px-3 py-1.5 text-right">
              <p className="text-[11px] text-muted-foreground">Toplam süre</p>
              <p className="text-sm font-semibold tabular-nums">{summary.totalWeeks} hafta</p>
              {summary.firstStart && summary.lastEnd && (
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {formatDate(summary.firstStart)} – {formatDate(summary.lastEnd)}
                </p>
              )}
            </div>
          )}
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

            {/* Çizelgede blok sürüklenebilir: taşıma ve süre değişimi
                zincirleme etkiyi CANLI gösterir (bkz. flow-timeline.tsx
                başlığı). Aynı işlemler satır menüsünde de duruyor —
                sürükleme tek yol değil. */}
            <FlowTimeline
              items={items}
              today={today}
              statuses={statuses}
              selectedId={selectedId}
              onSelect={item => setSelectedId(item.id ?? null)}
              onChange={update}
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
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item, index) => {
                    const key = flowItemKey(item, index)
                    const status = statuses.get(key) ?? 'later'
                    const weeks = durationWeeks(item)

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
                          {/* Durum kolonu kaldırıldı: nokta konunun yanında
                              durur (referans tasarım). Renk tek başına anlam
                              taşımasın diye title/sr-only karşılığı var. */}
                          <span className="flex items-center gap-2">
                          <span
                            title={FLOW_STATUS_LABEL[status]}
                            className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[status])}
                          >
                            <span className="sr-only">{FLOW_STATUS_LABEL[status]}</span>
                          </span>
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
                          </span>
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
                          <div className="flex items-center justify-end">
                            <FlowRowMenu
                              item={item}
                              index={index}
                              isLast={index === items.length - 1}
                              weeks={weeks}
                              onAction={update}
                              items={items}
                            />
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
                label: FLOW_STATUS_LABEL[selectedStatus],
                variant: STATUS_BADGE[selectedStatus],
              }}
              rows={[
                { label: 'Planlanan süre', value: `${durationWeeks(selected)} hafta` },
                { label: 'Planlanan başlangıç', value: formatLongDate(selected.startDate) },
                { label: 'Planlanan bitiş', value: formatLongDate(selected.endDate) },
                { label: 'Sıra', value: `${selectedIndex + 1}. konu` },
                {
                  label: 'Bu hafta',
                  value:
                    selectedWeek === null
                      ? '—'
                      : `${selectedWeek}. hafta / ${durationWeeks(selected)}`,
                },
                {
                  label: 'İlerleme',
                  value: `%${selectedProgress} (${
                    selectedWeek === null ? 0 : Math.max(0, selectedWeek - 1)
                  }/${durationWeeks(selected)} hafta)`,
                },
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

          {/* Akış Özeti: hafta toplamları. Detay paneli açıkken sağ kolonda
              onun altında, kapalıyken tablonun altında tam genişlikte durur —
              özet için ekranın sağ yarısını boş tutmaya değmez. */}
          <div
            className={cn(
              'rounded-xl border bg-card p-4',
              selected ? 'lg:col-start-2' : 'lg:col-span-full'
            )}
          >
            <h2 className="text-sm font-medium">Akış özeti</h2>
            <dl className="mt-3 space-y-1.5">
              {STATUS_ORDER.map(status => (
                <div key={status} className="flex items-center justify-between gap-3 text-xs">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <span
                      aria-hidden
                      className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[status])}
                    />
                    {FLOW_STATUS_LABEL[status]}
                  </dt>
                  <dd className="tabular-nums">{summary.weeksByStatus[status]} hafta</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t pt-1.5 text-xs font-medium">
                <dt>Toplam</dt>
                <dd className="tabular-nums">{summary.totalWeeks} hafta</dd>
              </div>
            </dl>
          </div>
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


      <ExplainerCards cards={EXPLAINERS} />
    </div>
  )
}

/**
 * Satır menüsü — dört ikon düğmesinin yerine geçti.
 *
 * Neden menü: satırda taşıma, süre, tamamlama ve silme için dört düğme
 * vardı; Böl ve Birleştir eklenince altı olacaktı ve tablo okunmaz hâle
 * gelirdi. Menü ayrıca her komutun ADINI yazar — ikonların tahmin
 * edilmesi gerekmiyor.
 *
 * Kaydedilmemiş blokta (id yok) menü kapalıdır: lib fonksiyonlarının
 * hepsi id ile çalışır.
 */
function FlowRowMenu({
  item,
  index,
  isLast,
  weeks,
  items,
  onAction,
}: {
  item: FlowItem
  index: number
  isLast: boolean
  weeks: number
  items: FlowItem[]
  onAction: (next: FlowItem[]) => void
}) {
  const id = item.id

  function split() {
    if (!id) return
    const raw = window.prompt(
      `"${item.name}" ${weeks} hafta. İlk parça kaç hafta olsun? (1-${weeks - 1})`,
      String(Math.max(1, Math.floor(weeks / 2)))
    )
    if (raw === null) return
    const first = Number(raw)
    if (!Number.isFinite(first)) return
    onAction(splitItem(items, id, first))
  }

  function remove() {
    if (!id) return
    if (
      window.confirm(
        `"${item.name}" akıştan çıkarılacak. Geçmiş çalışma silinmez. Devam edilsin mi?`
      )
    ) {
      onAction(removeItem(items, id))
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${item.name} işlemleri`}
        disabled={!id}
        title={id ? undefined : 'İşlem yapmak için önce akışı kaydedin'}
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-30"
      >
        <MoreVertical className="size-3.5" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => id && onAction(moveItem(items, id, 1))}>
          <ArrowRight className="size-4 shrink-0" />
          İleri taşı (devamı da kayar)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => id && onAction(moveItem(items, id, -1))}>
          <ArrowLeft className="size-4 shrink-0" />
          Geri taşı (devamı da kayar)
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* 1 haftalık blok bölünemez; parçalardan biri boş kalırdı. */}
        <DropdownMenuItem disabled={weeks < 2} onClick={split}>
          <SplitSquareHorizontal className="size-4 shrink-0" />
          Böl
        </DropdownMenuItem>
        {/* Son satırın birleşeceği bir sonraki blok yok. */}
        <DropdownMenuItem
          disabled={isLast}
          onClick={() => id && onAction(mergeWithNext(items, id))}
        >
          <Combine className="size-4 shrink-0" />
          Sonrakiyle birleştir
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => onAction(insertItem(items, index, 'Yeni konu', 1))}>
          <Plus className="size-4 shrink-0" />
          Konu ekle (öncesine)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction(insertItem(items, index + 1, 'Yeni konu', 1))}>
          <Plus className="size-4 shrink-0" />
          Konu ekle (sonrasına)
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => id && onAction(setPassed(items, id, !item.passed))}>
          <Check className="size-4 shrink-0" />
          {item.passed ? 'Tamamlandı işaretini kaldır' : 'Tamamlandı yap'}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={remove}>
          <Trash2 className="size-4 shrink-0" />
          Konuyu çıkar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
