'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CalendarClock, Check, Loader2, Play, Plus, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import {
  PACE_BAND_LABEL,
  type DailyDelivery,
  type PaceBand,
} from '@/lib/weekly-flow'
import { formatSessionLong, WEEKDAY_LABEL, type Weekday } from '@/lib/service-structure'
import { LinkTabs, type LinkTab } from '@/components/shared/link-tabs'
import {
  closeWeeklyFlowAction,
  openWeeklyFlowAction,
  setWeeklyFlowDueAction,
} from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface FlowBookRow {
  id: string
  title: string
  total: number
  delivered: number
}

export interface FlowBatchRow {
  id: string
  title: string
  publishedAt: string | null
  total: number
  delivered: number
  /** Akış açıldıktan SONRA yayınlandı — öğrencinin günlük planında yok. */
  lateAdded: boolean
}

export interface PastFlowRow {
  id: string
  startsAt: string
  dueAt: string
  closedAt: string | null
  onTimeDelivered: number | null
  onTimeTotal: number | null
}

export interface FlowView {
  id: string
  startsAt: string
  dueAt: string
  dueSource: 'anchor' | 'custom'
  /** Ana temastan gelen varsayılan — özel tarih seçiliyken de gösterilir. */
  anchorAt: string | null
  total: number
  delivered: number
  remaining: number
  lateAddedUnits: number
  distributionPhrase: string
  pace: {
    startingPerDay: number
    requiredPerDay: number
    band: PaceBand
    remainingMs: number
  } | null
  lastActivity: { silent: boolean; days: number; phrase: string }
  daily: DailyDelivery
}

/**
 * ALT SEKMELER (§8).
 *
 * Belge ekranın sınırını açıkça çiziyor: *"Haftalık Akış bütün sistemi
 * tek ekrana doldurmamalı. Ana ekran kısa operasyon görünümü olmalı;
 * ayrıntılar sekmelere bölünmeli."*
 *
 * Sekmeler AYNI TABLOYU iki kez göstermiyor; her biri farklı bir soruyu
 * yanıtlıyor:
 *   Aktif Akış      — "ne verdim, ne kadarı geldi?"      (parti ekseni)
 *   Günlük Görünüm  — "hangi gün çalıştı?"               (zaman ekseni)
 *   Kaynaklar       — "hangi kitaptan ne kadar?"         (kaynak ekseni)
 *   Yeni Eklenenler — "öğrencinin planını ne bozdu?"     (sonradan gelen)
 *   Geçmiş Haftalar — arşiv
 *
 * Dört özet kart sekmelerin ÜSTÜNDE sabit kalır: belgenin "3-5 saniyede
 * cevap" ölçüsü bir sekme seçmeyi gerektirmemeli.
 */
const FLOW_TABS = [
  { slug: 'aktif', label: 'Aktif Akış' },
  { slug: 'gunluk', label: 'Günlük Görünüm' },
  { slug: 'kaynaklar', label: 'Kaynaklar' },
  { slug: 'yeni', label: 'Yeni Eklenenler' },
  { slug: 'gecmis', label: 'Geçmiş Haftalar' },
] as const

type FlowTabSlug = (typeof FLOW_TABS)[number]['slug']

function resolveFlowTab(raw: string | null): FlowTabSlug {
  const hit = FLOW_TABS.find(t => t.slug === raw)
  return hit ? hit.slug : 'aktif'
}

const BAND_CLASS: Record<PaceBand, string> = {
  good: 'text-success-foreground bg-success-subtle border-success-border',
  slightly_behind: 'text-warning-foreground bg-warning-subtle border-warning-border',
  clearly_behind: 'text-warning-foreground bg-warning-subtle border-warning-border',
  critical: 'text-destructive bg-destructive/10 border-destructive/30',
}

function perDay(n: number): string {
  // Ondalık bir "çalışma" yoktur; yukarı yuvarlanır çünkü 19,2 çalışma
  // gerekiyorsa 19 yetmez.
  return `${Math.ceil(n)} çalışma/gün`
}

function remainingText(ms: number): string {
  if (ms <= 0) return 'Süre doldu'
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  if (days === 0) return `${hours} saat`
  return `${days} gün ${hours} saat`
}

/** `datetime-local` girdisi için yerel biçim. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function FlowClient({
  studentId,
  studentName,
  flow,
  books,
  batches,
  past,
  anchorServiceId,
  suggestedDueAt,
}: {
  studentId: string
  studentName: string
  flow: FlowView | null
  books: FlowBookRow[]
  batches: FlowBatchRow[]
  past: PastFlowRow[]
  anchorServiceId: string | null
  suggestedDueAt: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // Sekme URL'de taşınıyor (repo kalıbı: ?sekme=). Client state'te
  // tutulsaydı yenilemede kaybolur, paylaşılamaz ve geri tuşuyla
  // gezilemezdi. Öğrenci şeridi bu parametreyi yalnız Genel Bakış
  // rotasında okuduğu için burada çakışma olmuyor.
  const activeTab = resolveFlowTab(searchParams.get('sekme'))
  const tabs: LinkTab[] = FLOW_TABS.map(t => ({
    key: t.slug,
    label: t.label,
    href: t.slug === 'aktif' ? pathname : `${pathname}?sekme=${t.slug}`,
    count:
      t.slug === 'yeni' && flow && flow.lateAddedUnits > 0
        ? flow.lateAddedUnits
        : t.slug === 'gecmis' && past.length > 0
          ? past.length
          : undefined,
  }))
  const [editingDue, setEditingDue] = useState(false)
  const [dueInput, setDueInput] = useState(flow ? toLocalInput(flow.dueAt) : '')

  function openFlow() {
    if (!suggestedDueAt) {
      toast.error(
        'Ana temas tanımlı değil. Haftanın kapanışını üretebilmek için önce Görüşmeler ekranından hizmet ekleyin.'
      )
      return
    }
    startTransition(async () => {
      const r = await openWeeklyFlowAction({
        studentId,
        startsAt: new Date().toISOString(),
        dueAt: suggestedDueAt,
        dueSource: 'anchor',
        anchorServiceId: anchorServiceId ?? undefined,
      })
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success('Haftalık akış açıldı.')
      router.refresh()
    })
  }

  function closeFlow() {
    if (!flow) return
    startTransition(async () => {
      if (
        !window.confirm(
          `Hafta kapatılacak ve ${flow.delivered}/${flow.total} zamanında teslim fotoğrafı kaydedilecek. ` +
            'Bu fotoğraf bir daha değişmez. Devam edilsin mi?'
        )
      ) {
        return
      }
      const r = await closeWeeklyFlowAction({ studentId, flowId: flow.id })
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success('Hafta kapatıldı ve arşivlendi.')
      router.refresh()
    })
  }

  function saveDue() {
    if (!flow) return
    startTransition(async () => {
      const r = await setWeeklyFlowDueAction({
        studentId,
        flowId: flow.id,
        dueAt: new Date(dueInput).toISOString(),
        // Elle seçilen tarih her zaman 'custom': bundan sonra ana temas
        // bu haftanın kapanışını kendiliğinden değiştirmez (§4).
        source: 'custom',
      })
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success('Haftanın son teslimi güncellendi.')
      setEditingDue(false)
      router.refresh()
    })
  }

  const percent = flow && flow.total > 0 ? Math.round((flow.delivered / flow.total) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Haftalık Akış</h1>
          <p className="text-sm text-muted-foreground">
            {studentName} · haftalık çalışma süreci ve ilerleme durumu
          </p>
        </div>
        <Button variant="outline" size="sm" render={<Link href={`/teacher/students/${studentId}/homework/new`} />}>
          <Plus className="size-4" />
          Ödev Planlama
        </Button>
      </div>

      {!flow ? (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-sm font-medium">Açık haftalık akış yok.</p>
            <p className="text-sm text-muted-foreground">
              {suggestedDueAt ? (
                <>
                  Ana temasa göre bu haftanın kapanışı{' '}
                  <strong>{formatSessionLong(suggestedDueAt)}</strong> olur. Ödev
                  Planlama yeni hafta açmaz; yalnız açık haftanın içine yayın yapar.
                </>
              ) : (
                <>
                  Ana temas tanımlı olmadığı için haftanın kapanışı üretilemiyor.
                  Önce Görüşmeler ekranından düzenli bir hizmet tanımlayın — akışın
                  ritmi oradan gelir.
                </>
              )}
            </p>
            <Button onClick={openFlow} disabled={isPending || !suggestedDueAt}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Haftalık akışı aç
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-4">
            {/* 1 — Genel Durum */}
            <Card>
              <CardContent className="space-y-2 pt-5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  GENEL DURUM
                </p>
                <p className="text-3xl font-semibold tabular-nums">%{percent}</p>
                <dl className="space-y-0.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Tamamlanan</dt>
                    <dd className="tabular-nums">{flow.delivered}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Kalan</dt>
                    <dd className="tabular-nums">{flow.remaining}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Toplam</dt>
                    <dd className="tabular-nums">{flow.total}</dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">{flow.distributionPhrase}</p>
              </CardContent>
            </Card>

            {/* 3 — Hafta Bilgileri */}
            <Card>
              <CardContent className="space-y-2 pt-5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  HAFTA BİLGİLERİ
                </p>
                <div className="space-y-1.5 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Haftanın başlangıcı</p>
                    <p>{formatSessionLong(flow.startsAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Son teslim{' '}
                      {flow.dueSource === 'custom' ? '(özel seçildi)' : '(ana temastan)'}
                    </p>
                    <p className="font-medium">{formatSessionLong(flow.dueAt)}</p>
                  </div>
                  {/* Özel tarih seçiliyken ana temas ATILMAZ: ikisi
                      ayrıştıysa öğretmen bunu görmeli. */}
                  {flow.dueSource === 'custom' && flow.anchorAt && (
                    <p className="text-xs text-muted-foreground">
                      Ana temas: {formatSessionLong(flow.anchorAt)}
                    </p>
                  )}
                </div>

                {editingDue ? (
                  <div className="space-y-2">
                    <Label htmlFor="due" className="text-xs">
                      Yeni son teslim
                    </Label>
                    <Input
                      id="due"
                      type="datetime-local"
                      value={dueInput}
                      onChange={e => setDueInput(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveDue} disabled={isPending || !dueInput}>
                        Kaydet
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingDue(false)}>
                        Vazgeç
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setEditingDue(true)}>
                    <CalendarClock className="size-4" />
                    Değiştir
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* 3 — Çalışma Temposu */}
            <Card>
              <CardContent className="space-y-2 pt-5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  ÇALIŞMA TEMPOSU
                </p>
                {flow.pace ? (
                  <>
                    <div className="space-y-1 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Başlangıç temposu</p>
                        <p className="tabular-nums">{perDay(flow.pace.startingPerDay)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Güncel gerekli tempo</p>
                        <p className="tabular-nums">{perDay(flow.pace.requiredPerDay)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Kalan süre</p>
                        <p className="tabular-nums">{remainingText(flow.pace.remainingMs)}</p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${BAND_CLASS[flow.pace.band]}`}
                    >
                      {PACE_BAND_LABEL[flow.pace.band]}
                    </span>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Bu haftaya henüz çalışma yayınlanmadı; tempo hesaplanmıyor.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 4 — Son Hareket */}
            <Card>
              <CardContent className="space-y-2 pt-5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  SON HAREKET
                </p>
                <p
                  className={`flex items-start gap-1.5 text-sm ${
                    flow.lastActivity.silent ? 'text-warning-foreground' : ''
                  }`}
                >
                  {flow.lastActivity.silent && (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  )}
                  {flow.lastActivity.phrase}
                </p>
                {flow.lateAddedUnits > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Hafta açıldıktan sonra {flow.lateAddedUnits} çalışma eklendi.
                  </p>
                )}
                <Button size="sm" variant="outline" onClick={closeFlow} disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Haftayı kapat
                </Button>
              </CardContent>
            </Card>
          </div>

          <LinkTabs
            tabs={tabs}
            activeKey={activeTab}
            ariaLabel="Haftalık akış görünümü"
          />

          {activeTab === 'aktif' && (
            <BatchPanel batches={batches} flow={flow} studentId={studentId} />
          )}
          {activeTab === 'gunluk' && <DailyPanel daily={flow.daily} />}
          {activeTab === 'kaynaklar' && <BookPanel books={books} flow={flow} />}
          {activeTab === 'yeni' && (
            <NewlyAddedPanel batches={batches.filter(b => b.lateAdded)} />
          )}
          {activeTab === 'gecmis' && <PastPanel past={past} />}
        </>
      )}

      {/* Akış yokken de arşiv görünür: geçmiş, açık hafta olmadığı için
          kaybolmaz (kabul #12). */}
      {!flow && past.length > 0 && <PastPanel past={past} />}
    </div>
  )
}

/** Aktif Akış — "ne verdim, ne kadarı geldi?" (parti ekseni). */
function BatchPanel({
  batches,
  flow,
  studentId,
}: {
  batches: FlowBatchRow[]
  flow: FlowView
  studentId: string
}) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <h2 className="font-medium">Haftadaki ödevler</h2>
        {batches.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Bu haftaya henüz çalışma yayınlanmadı. Ödev Planlama ekranından
              yayınlanan çalışmalar burada toplanır.
            </p>
            <Button
              size="sm"
              render={<Link href={`/teacher/students/${studentId}/homework/new`} />}
            >
              <Plus className="size-4" />
              Ödev Planlama&apos;ya git
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Ödev</th>
                  <th className="py-2 text-right font-medium">Toplam</th>
                  <th className="py-2 text-right font-medium">Tamamlanan</th>
                  <th className="py-2 text-right font-medium">Kalan</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="py-2">
                      {b.title}
                      {b.lateAdded && (
                        <span className="ml-2 rounded-md border border-warning-border bg-warning-subtle px-1.5 py-0.5 text-xs text-warning-foreground">
                          sonradan eklendi
                        </span>
                      )}
                      {b.publishedAt && (
                        <span className="block text-xs text-muted-foreground">
                          {formatSessionLong(b.publishedAt)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{b.total}</td>
                    <td className="py-2 text-right tabular-nums">{b.delivered}</td>
                    <td className="py-2 text-right tabular-nums">
                      {b.total - b.delivered}
                    </td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-2">Toplam</td>
                  <td className="py-2 text-right tabular-nums">{flow.total}</td>
                  <td className="py-2 text-right tabular-nums">{flow.delivered}</td>
                  <td className="py-2 text-right tabular-nums">{flow.remaining}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Kaynaklar — "hangi kitaptan ne kadar?" */
function BookPanel({ books, flow }: { books: FlowBookRow[]; flow: FlowView }) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <h2 className="font-medium">Kaynak kırılımı</h2>
        {books.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Bu haftaya henüz çalışma yayınlanmadı.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Kaynak</th>
                  <th className="py-2 text-right font-medium">Toplam</th>
                  <th className="py-2 text-right font-medium">Tamamlanan</th>
                  <th className="py-2 text-right font-medium">Kalan</th>
                </tr>
              </thead>
              <tbody>
                {books.map(b => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="py-2">{b.title}</td>
                    <td className="py-2 text-right tabular-nums">{b.total}</td>
                    <td className="py-2 text-right tabular-nums">{b.delivered}</td>
                    <td className="py-2 text-right tabular-nums">
                      {b.total - b.delivered}
                    </td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-2">Toplam</td>
                  <td className="py-2 text-right tabular-nums">{flow.total}</td>
                  <td className="py-2 text-right tabular-nums">{flow.delivered}</td>
                  <td className="py-2 text-right tabular-nums">{flow.remaining}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Günlük Görünüm — "hangi gün çalıştı?" */
function DailyPanel({ daily }: { daily: DailyDelivery }) {
  const max = Math.max(1, ...daily.days.map(d => d.delivered))

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <h2 className="font-medium">Günlük dağılım</h2>

        <div className="overflow-x-auto">
          <div className="flex min-w-max items-end gap-2">
            {daily.days.map(d => (
              <div key={d.date} className="flex w-12 flex-col items-center gap-1">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {d.delivered}
                </span>
                {/* Çubuk yüksekliği en yoğun güne göre ölçekleniyor;
                    sıfır teslimde ince bir taban çizgisi kalır ki "veri
                    yok" ile "o gün çalışılmadı" karışmasın. */}
                <div
                  className="w-full rounded-sm bg-success-subtle"
                  style={{
                    height: `${Math.max(4, Math.round((d.delivered / max) * 72))}px`,
                  }}
                  aria-hidden
                />
                <span className="text-xs text-muted-foreground">
                  {WEEKDAY_LABEL[d.weekday as Weekday].slice(0, 3)}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {d.date.slice(8)}.{d.date.slice(5, 7)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {daily.outsideWindow > 0 && (
          <p className="text-xs text-warning-foreground">
            {daily.outsideWindow} teslim haftanın penceresi dışında yapıldı; bu
            grafikte yer almaz.
          </p>
        )}

        {/* Belgedeki hedef ekranda ikinci bir "planlanan" ekseni var ama
            verisi henüz yok — öğrencinin günlük dağıtımı R7-05'in kendi
            "sonraki adım"ı. Boş çubuk çizmek yerine eksikliği söylemek
            doğru: uydurulmuş bir eksen, olmayan bir planı varmış gibi
            gösterirdi. */}
        <p className="text-xs text-muted-foreground">
          Yalnız gerçekleşen teslimler gösterilir. Öğrencinin yükü günlere
          kendi dağıtması ayrı bir çalışma; o geldiğinde planlanan/gerçekleşen
          karşılaştırması buraya eklenecek.
        </p>
      </CardContent>
    </Card>
  )
}

/** Yeni Eklenenler — "öğrencinin planını ne bozdu?" */
function NewlyAddedPanel({ batches }: { batches: FlowBatchRow[] }) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <h2 className="font-medium">Hafta açıldıktan sonra eklenenler</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Hafta açıldıktan sonra yeni çalışma eklenmedi.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Ödev</th>
                    <th className="py-2 font-medium">Yayın</th>
                    <th className="py-2 text-right font-medium">Çalışma</th>
                    <th className="py-2 text-right font-medium">Tamamlanan</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2">{b.title}</td>
                      <td className="py-2">
                        {b.publishedAt ? formatSessionLong(b.publishedAt) : '—'}
                      </td>
                      <td className="py-2 text-right tabular-nums">{b.total}</td>
                      <td className="py-2 text-right tabular-nums">{b.delivered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Senaryo A: toplam yük artar, kapanış saati değişmez ve
                öğrencinin eski günlük dağılımı BOZULMAZ (kabul #6). */}
            <p className="text-xs text-muted-foreground">
              Bu çalışmalar haftanın toplam yükünü artırdı ama kapanış saatini
              değiştirmedi. Öğrencinin daha önce kurduğu günlük dağılım
              bozulmaz; yeni çalışmalar dağıtılmayı bekler.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Geçmiş Haftalar — silinmez, arşivlenir (kabul #12). */
function PastPanel({ past }: { past: PastFlowRow[] }) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <h2 className="font-medium">Geçmiş akışlar</h2>
        {past.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Henüz kapanmış bir hafta yok.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Hafta</th>
                    <th className="py-2 font-medium">Son teslim</th>
                    <th className="py-2 text-right font-medium">Zamanında teslim</th>
                  </tr>
                </thead>
                <tbody>
                  {past.map(p => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2">{formatSessionLong(p.startsAt)}</td>
                      <td className="py-2">{formatSessionLong(p.dueAt)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {p.onTimeTotal === null
                          ? '—'
                          : `${p.onTimeDelivered ?? 0} / ${p.onTimeTotal}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Zamanında teslim, haftanın kapandığı andaki fotoğraftır. Geç gelen
              teslimler tamamlanma oranını yükseltir ama bu sayıyı değiştirmez.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
