'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pencil, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  CADENCE_LABEL,
  FINANCE_LINK_LABEL,
  WEEKDAY_LABEL,
  formatServiceAxes,
  formatServiceSchedule,
  type FinanceLink,
  type ServiceCadence,
  type Weekday,
} from '@/lib/service-structure'
import {
  COLLECTION_TIMING_LABEL,
  FINANCE_MODEL_LABEL,
  PRICE_TYPE_LABEL,
  TIMING_OPTIONS,
  modelAt,
  priceAt,
  priceHistory,
  type CollectionTiming,
  type FinanceModel,
  type PriceType,
} from '@/lib/pricing-history'
import { formatUnits } from '@/lib/session-state'
import { formatKurus } from '@/lib/billing/pricing'
import { kurusToInput, parseLiraToKurus } from '@/lib/finance'
import { todayDateString } from '@/lib/homework-status'
import {
  createServiceAction,
  createStudentGroupAction,
  deleteUnusedServiceAction,
  duplicateServiceAction,
  setMainContactAction,
  setServiceStatusAction,
  updateServiceAction,
  type ServiceUpdateInput,
} from './actions'
import { deletePriceVersionAction, setFinanceModelAction } from '../../../finans/actions'
import type { FinanceModelInfo, ServiceRow } from './types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/shared/empty-state'
import { SegmentedField } from '@/components/shared/segmented-field'

/**
 * HİZMET YAPISI V1 — sağdan açılan ayar katmanı (M1.0-02 §3).
 *
 * Ekranın cevapladığı soru: "Bu öğrenciyle çalışma düzenimiz nedir?"
 * Öğretmen 5 saniyede hangi hizmetler, hangi ritimde ve hangi finans
 * modeliyle verildiğini görebilmeli.
 *
 * NORMAL DURUMDA OKUNABİLİR ÖZET KART, FORM YIĞINI DEĞİL (§12 UI kabul):
 * her alan aynı anda input değildir; "Düzenle" yalnız seçilen kartı açar.
 *
 * KAYDETME DÜĞMESİ YOK: her işlem kendi başına bir sunucu eylemi ve
 * anında yazılır — ileri tarihli düzen değişikliği oturum siler (084/140),
 * pasife alma gelecek üretimi durdurur. Bunları bir "kaydet"in arkasına
 * biriktirmek, yarıda kapatılan panelde sessiz veri kaybı yaratırdı.
 */

/** Panelin okuduğu tek kimlik bilgisi — bağlam kaybolmasın diye başlıkta. */
export interface DrawerStudent {
  id: string
  name: string
  /** "Mezun · YKS" gibi; yoksa satır hiç çizilmez. */
  meta: string | null
}

const FINANCE_OPTIONS = (['aylik_paket', 'ders_basi', 'haric'] as FinanceLink[]).map((value) => ({
  value,
  label: FINANCE_LINK_LABEL[value],
}))

const CADENCE_OPTIONS = (['haftada_1', 'haftada_2', 'esnek'] as ServiceCadence[]).map((value) => ({
  value,
  label: CADENCE_LABEL[value],
}))

const UNIT_OPTIONS = ['0.5', '1', '1.5', '2']

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** "Haftada 1 · 60 dk · varsayılan Cumartesi 16:00 · Modele dahil · 1 ders" */
function serviceSummary(service: ServiceRow): string {
  const rhythm =
    service.cadence === 'esnek'
      ? `Esnek · ${service.plannedDurationMinutes} dk`
      : `${CADENCE_LABEL[service.cadence]} · varsayılan ${formatServiceSchedule(service)}`
  return [rhythm, FINANCE_LINK_LABEL[service.financeLink], `${formatUnits(service.defaultUnitCount)}`].join(
    ' · '
  )
}

export function ServiceStructureDrawer({
  open,
  onOpenChange,
  student,
  services,
  groups,
  mainContactId,
  finance,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  student: DrawerStudent
  services: ServiceRow[]
  groups: { id: string; name: string }[]
  mainContactId: string | null
  /** null = ücretlendirmeyi görme/düzenleme yetkisi yok (yalnız sahip). */
  finance: FinanceModelInfo | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showPassive, setShowPassive] = useState(false)

  function run(action: () => Promise<{ error?: string; success?: boolean }>, ok: string) {
    startTransition(async () => {
      const result = await action()
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success(ok)
      router.refresh()
    })
  }

  function handleUpdate(input: ServiceUpdateInput) {
    startTransition(async () => {
      const result = await updateServiceAction(input)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      const removed = result.removed ?? 0
      toast.success(
        removed > 0
          ? `Düzen güncellendi. Eski düzenle açılmış ${removed} ileri tarihli oturum kaldırıldı; yeni düzenle tekrar üretilecek.`
          : 'Düzen güncellendi.'
      )
      setEditingId(null)
      router.refresh()
    })
  }

  const active = services.filter((s) => s.status === 'active')
  const passive = services.filter((s) => s.status === 'passive')
  const archivedCount = services.filter((s) => s.status === 'archived').length
  const manualMain = services.some((s) => s.isMainContact && s.status === 'active')

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-w-2xl">
        <DrawerHeader>
          <DrawerTitle>Hizmet Yapısı</DrawerTitle>
          <DrawerDescription>
            {student.name}
            {student.meta && ` · ${student.meta}`} — bu öğrenciyle çalışma düzeni.
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="space-y-5">
          <FinanceModelCard studentId={student.id} finance={finance} />

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-medium">Aktif Hizmetler</h3>
              <span className="text-xs text-muted-foreground">{active.length} aktif hizmet</span>
            </div>

            {active.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Aktif hizmet yok"
                description="Öğrencinin ders ve koçluk düzenini tanımlayın. Haftalık Akış bu düzenden beslenir."
              />
            ) : (
              <ul className="space-y-3">
                {active.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    isMain={service.id === mainContactId}
                    manualMain={manualMain}
                    editing={editingId === service.id}
                    disabled={isPending}
                    onEdit={() => setEditingId((id) => (id === service.id ? null : service.id))}
                    onCancelEdit={() => setEditingId(null)}
                    onSubmit={handleUpdate}
                    studentId={student.id}
                    run={run}
                  />
                ))}
              </ul>
            )}

            {/* §3 Bilgi metni — gün/saat artık bir söz değil, varsayılan. */}
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Gün ve saat haftalık planlama için varsayılandır. Tek bir haftanın tarih/saat
              değişikliği Hizmet Yapısını değiştirmez. Ana temas{' '}
              {manualMain ? 'elle seçildi' : 'otomatik belirlenir (Koçluk > Birebir Ders > Grup Dersi)'}.
            </p>
          </section>

          {(passive.length > 0 || archivedCount > 0) && (
            <section className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-medium">Pasif Hizmetler</h3>
                <Button size="xs" variant="ghost" onClick={() => setShowPassive((v) => !v)}>
                  {showPassive ? 'Gizle' : `Göster (${passive.length})`}
                </Button>
              </div>
              {archivedCount > 0 && (
                <p className="text-xs text-muted-foreground">{archivedCount} arşivlenmiş hizmet.</p>
              )}
              {showPassive && (
                <ul className="space-y-2">
                  {passive.map((service) => (
                    <li
                      key={service.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-muted-foreground">{formatServiceAxes(service)}</p>
                        <p className="text-xs text-muted-foreground">{serviceSummary(service)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () => setServiceStatusAction(student.id, service.id, 'active'),
                              'Hizmet yeniden aktifleştirildi.'
                            )
                          }
                        >
                          Aktifleştir
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () => setServiceStatusAction(student.id, service.id, 'archived'),
                              'Hizmet arşivlendi.'
                            )
                          }
                        >
                          Arşivle
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-medium">Yeni Hizmet Ekle</h3>
              {!showForm && (
                <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
                  <Plus className="size-4" />
                  Hizmet Ekle
                </Button>
              )}
            </div>

            {showForm && (
              <ServiceForm
                studentId={student.id}
                groups={groups}
                disabled={isPending}
                onDone={() => setShowForm(false)}
                run={run}
              />
            )}
          </section>
        </DrawerBody>

        <DrawerFooter>
          <p className="text-xs text-muted-foreground">
            Her değişiklik yapıldığı anda kaydedilir. Geçmiş kayıtlar etkilenmez.
          </p>
          <DrawerClose render={<Button variant="outline" />}>Kapat</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

// ============================================================
// HİZMET MODELİ (§3 "Hizmet modeli paneli")
// ============================================================

function FinanceModelCard({
  studentId,
  finance,
}: {
  studentId: string
  finance: FinanceModelInfo | null
}) {
  const [editing, setEditing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  if (!finance) {
    return (
      <section className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
        Ücretlendirme modelini çalışma alanı sahibi yönetir.
      </section>
    )
  }

  const today = todayDateString()
  const current = modelAt(finance.models, today)
  // Gelecekte başlayacak bir model varsa onu da söyle: "01.01.2027'den 14.000 TL".
  const upcoming = finance.models
    .filter((m) => m.validFrom > today)
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom))[0]

  const mainType: PriceType | null = current
    ? current.model === 'aylik_sabit'
      ? 'aylik'
      : 'ders_basi'
    : null
  const mainPrice = mainType ? priceAt(finance.prices, mainType, today) : null
  const extraPrice = current?.model === 'aylik_sabit' ? priceAt(finance.prices, 'ek_ders', today) : null

  const summary = current
    ? [
        `${FINANCE_MODEL_LABEL[current.model]} ${
          mainPrice != null ? formatKurus(mainPrice) : '—'
        }${current.model === 'aylik_sabit' ? ' / ay' : ' / ders'}`,
        `Tahsilat: ${COLLECTION_TIMING_LABEL[current.collectionTiming]}`,
        // 2000-01-01: 139'un taşıdığı eski tek fiyat — "başlangıçtan beri".
        current.validFrom === '2000-01-01' ? null : `${formatDate(current.validFrom)}'den geçerli`,
        current.model === 'aylik_sabit'
          ? `Ek ders ${extraPrice != null ? formatKurus(extraPrice) : 'tanımsız'}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Ücretlendirme modeli tanımlanmadı. Gerçekleşen dersler finansa yansımaz.'

  const historyTypes: PriceType[] = ['aylik', 'ek_ders', 'ders_basi']

  return (
    <section className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium">Hizmet Modeli</h3>
          <p className="mt-1 text-sm text-foreground">{summary}</p>
          {upcoming && (
            <p className="mt-1 text-xs text-muted-foreground">
              {`${formatDate(upcoming.validFrom)}'den itibaren: ${FINANCE_MODEL_LABEL[upcoming.model]}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
            <Pencil className="size-3.5" />
            {editing ? 'Kapat' : 'Düzenle'}
          </Button>
          {finance.prices.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? 'Geçmişi gizle' : 'Fiyat geçmişi'}
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <FinanceModelForm
          studentId={studentId}
          initialModel={current?.model ?? 'ders_basi'}
          initialTiming={current?.collectionTiming ?? 'ay_sonu'}
          initialMain={mainPrice}
          initialExtra={extraPrice}
          onDone={() => setEditing(false)}
        />
      )}

      {showHistory && (
        <PriceHistoryList studentId={studentId} finance={finance} types={historyTypes} />
      )}
    </section>
  )
}

function PriceHistoryList({
  studentId,
  finance,
  types,
}: {
  studentId: string
  finance: FinanceModelInfo
  types: PriceType[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <dl className="mt-3 space-y-2 border-t border-border pt-3 text-xs">
      {types.map((type) => {
        const rows = priceHistory(finance.prices, type)
        if (rows.length === 0) return null
        return (
          <div key={type} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted-foreground">{PRICE_TYPE_LABEL[type]}</dt>
            <dd className="flex flex-wrap gap-x-3 gap-y-1">
              {rows.map((row) => (
                <span key={row.validFrom} className="inline-flex items-center gap-1 tabular-nums">
                  {row.validFrom === '2000-01-01' ? 'Başlangıçtan' : formatDate(row.validFrom)}:{' '}
                  {formatKurus(row.amountKurus)}
                  {row.id && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                      disabled={isPending}
                      aria-label="Fiyat sürümünü sil"
                      onClick={() => {
                        if (!window.confirm('Bu fiyat sürümü silinsin mi? Geçmiş tahakkuk tutarları değişmez.')) return
                        startTransition(async () => {
                          const r = await deletePriceVersionAction(studentId, row.id!)
                          if (r.error) toast.error(r.error)
                          else router.refresh()
                        })
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </dd>
          </div>
        )
      })}
      <p className="text-muted-foreground">
        Fiyatlar üzerine yazılmaz; yeni değer seçilen tarihten itibaren yeni sürümdür. Geçmiş
        dönemler eski fiyatla kalır.
      </p>
    </dl>
  )
}

function FinanceModelForm({
  studentId,
  initialModel,
  initialTiming,
  initialMain,
  initialExtra,
  onDone,
}: {
  studentId: string
  initialModel: FinanceModel
  initialTiming: CollectionTiming
  initialMain: number | null
  initialExtra: number | null
  onDone: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [model, setModel] = useState<FinanceModel>(initialModel)
  const [timing, setTiming] = useState<CollectionTiming>(initialTiming)
  const [main, setMain] = useState(initialMain != null ? kurusToInput(initialMain) : '')
  const [extra, setExtra] = useState(initialExtra != null ? kurusToInput(initialExtra) : '')
  const [validFrom, setValidFrom] = useState(() => `${todayDateString().slice(0, 7)}-01`)

  const timingOptions = TIMING_OPTIONS[model].map((value) => ({
    value,
    label: COLLECTION_TIMING_LABEL[value],
  }))

  function changeModel(next: FinanceModel) {
    setModel(next)
    if (!TIMING_OPTIONS[next].includes(timing)) setTiming(TIMING_OPTIONS[next][0])
  }

  function submit() {
    const mainKurus = parseLiraToKurus(main)
    if (mainKurus === null) {
      toast.error(model === 'aylik_sabit' ? 'Aylık tutarı girin.' : 'Ders birim fiyatını girin.')
      return
    }
    const extraKurus = extra.trim() === '' ? null : parseLiraToKurus(extra)
    if (extra.trim() !== '' && extraKurus === null) {
      toast.error('Geçerli bir ek ders fiyatı girin.')
      return
    }
    startTransition(async () => {
      const r = await setFinanceModelAction({
        studentId,
        model,
        collectionTiming: timing,
        validFrom,
        mainAmountKurus: mainKurus,
        extraAmountKurus: model === 'aylik_sabit' ? extraKurus : null,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success('Hizmet modeli kaydedildi.')
      onDone()
      router.refresh()
    })
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SegmentedField
          label="Model"
          value={model}
          onChange={changeModel}
          disabled={isPending}
          options={[
            { value: 'aylik_sabit', label: 'Aylık Sabit' },
            { value: 'ders_basi', label: 'Ders Başı' },
          ]}
        />
        <SegmentedField
          label="Tahsilat"
          value={timing}
          onChange={setTiming}
          disabled={isPending}
          options={timingOptions}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="fmMain">{model === 'aylik_sabit' ? 'Aylık tutar (TL)' : 'Ders birim fiyatı (TL)'}</Label>
          <Input id="fmMain" inputMode="decimal" value={main} onChange={(e) => setMain(e.target.value)} placeholder={model === 'aylik_sabit' ? '12500' : '4000'} />
        </div>
        {model === 'aylik_sabit' && (
          <div className="space-y-1.5">
            <Label htmlFor="fmExtra">Ek birebir ders fiyatı (TL)</Label>
            <Input id="fmExtra" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="1750" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="fmFrom">Geçerlilik başlangıcı</Label>
          <Input id="fmFrom" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {model === 'aylik_sabit'
          ? 'Aylık tutar her ay bir kez tahakkuk eder. "Modele dahil" ders ve koçluklar ayrıca ücret üretmez; ek ders, ek ders fiyatıyla ücretlenir.'
          : 'Gerçekleşen her oturum, ders birimi × bu fiyat kadar tahakkuk eder (ör. 1,5 ders).'}{' '}
        Geçmiş dönemler eski fiyatla kalır.
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={isPending} onClick={submit}>
          Kaydet
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Vazgeç
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// HİZMET KARTI
// ============================================================

function ServiceCard({
  service,
  isMain,
  manualMain,
  editing,
  disabled,
  onEdit,
  onCancelEdit,
  onSubmit,
  studentId,
  run,
}: {
  service: ServiceRow
  isMain: boolean
  manualMain: boolean
  editing: boolean
  disabled: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSubmit: (input: ServiceUpdateInput) => void
  studentId: string
  run: (action: () => Promise<{ error?: string; success?: boolean }>, ok: string) => void
}) {
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {formatServiceAxes(service)}
            {service.groupName && <span className="text-muted-foreground"> · {service.groupName}</span>}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{serviceSummary(service)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="success">Aktif</Badge>
            {isMain && <Badge variant="info">Ana temas</Badge>}
            <span className="text-xs text-muted-foreground">Başlangıç {formatDate(service.startDate)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="outline" disabled={disabled} onClick={onEdit}>
            {editing ? 'Kapat' : 'Düzenle'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Hizmet işlemleri"
              disabled={disabled}
              className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {isMain && manualMain ? (
                <DropdownMenuItem
                  onClick={() => run(() => setMainContactAction(studentId, null), 'Ana temas otomatiğe döndü.')}
                >
                  Ana teması otomatiğe bırak
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  disabled={isMain}
                  onClick={() => run(() => setMainContactAction(studentId, service.id), 'Ana temas seçildi.')}
                >
                  Ana temas yap
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => run(() => duplicateServiceAction(studentId, service.id), 'Hizmet çoğaltıldı.')}
              >
                Çoğalt
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  run(() => setServiceStatusAction(studentId, service.id, 'passive'), 'Hizmet pasife alındı.')
                }
              >
                Pasife al
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  run(() => setServiceStatusAction(studentId, service.id, 'archived'), 'Hizmet arşivlendi.')
                }
              >
                Arşivle
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  if (!window.confirm('Hizmet kalıcı olarak silinsin mi? Yalnız hiç kullanılmamış hizmet silinebilir.')) return
                  run(() => deleteUnusedServiceAction(studentId, service.id), 'Hizmet silindi.')
                }}
              >
                Sil
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {editing && (
        <ServiceEditForm
          studentId={studentId}
          service={service}
          disabled={disabled}
          onSubmit={onSubmit}
          onCancel={onCancelEdit}
        />
      )}
    </li>
  )
}

// ============================================================
// RİTİM ALANLARI — yeni hizmet ve düzenleme ortak
// ============================================================

function RhythmFields({
  idPrefix,
  cadence,
  setCadence,
  weekday,
  setWeekday,
  startTime,
  setStartTime,
  weekday2,
  setWeekday2,
  startTime2,
  setStartTime2,
  duration,
  setDuration,
  unit,
  setUnit,
  allowFlexible,
  disabled,
}: {
  idPrefix: string
  cadence: ServiceCadence
  setCadence: (v: ServiceCadence) => void
  weekday: string
  setWeekday: (v: string) => void
  startTime: string
  setStartTime: (v: string) => void
  weekday2: string
  setWeekday2: (v: string) => void
  startTime2: string
  setStartTime2: (v: string) => void
  duration: string
  setDuration: (v: string) => void
  unit: string
  setUnit: (v: string) => void
  allowFlexible: boolean
  disabled?: boolean
}) {
  const custom = !UNIT_OPTIONS.includes(unit)
  return (
    <div className="space-y-3">
      <SegmentedField
        label="Ritim"
        value={cadence}
        onChange={setCadence}
        disabled={disabled}
        options={allowFlexible ? CADENCE_OPTIONS : CADENCE_OPTIONS.filter((o) => o.value !== 'esnek')}
      />
      {cadence !== 'esnek' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <DaySelect id={`${idPrefix}Day`} label="Varsayılan gün" value={weekday} onChange={setWeekday} />
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}Time`}>Varsayılan saat</Label>
            <Input id={`${idPrefix}Time`} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          {cadence === 'haftada_2' && (
            <>
              <DaySelect id={`${idPrefix}Day2`} label="2. gün" value={weekday2} onChange={setWeekday2} />
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}Time2`}>2. saat</Label>
                <Input id={`${idPrefix}Time2`} type="time" value={startTime2} onChange={(e) => setStartTime2(e.target.value)} />
              </div>
            </>
          )}
        </div>
      )}
      {cadence === 'esnek' && (
        <p className="text-xs text-muted-foreground">
          Esnek ritimde takvim üretilmez; her oturum Ders &amp; Görüşmeler&apos;den tarihiyle eklenir.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}Duration`}>Süre (dk)</Label>
          <Input
            id={`${idPrefix}Duration`}
            type="number"
            min={5}
            max={600}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}Unit`}>Varsayılan ders birimi</Label>
          <div className="flex items-center gap-2">
            <NativeSelect
              id={`${idPrefix}Unit`}
              value={custom ? 'ozel' : unit}
              onChange={(e) => setUnit(e.target.value === 'ozel' ? '' : e.target.value)}
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u.replace('.', ',')} ders
                </option>
              ))}
              <option value="ozel">Özel</option>
            </NativeSelect>
            {custom && (
              <Input
                aria-label="Özel ders birimi"
                inputMode="decimal"
                className="w-24"
                value={unit}
                onChange={(e) => setUnit(e.target.value.replace(',', '.'))}
                placeholder="2.5"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DaySelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((d) => (
          <option key={d} value={d}>
            {WEEKDAY_LABEL[d]}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}

/**
 * Yeni hizmet formu. ÜÇ EKSEN AYRI SEÇİLİR (Hizmet / Katılım / Ortam);
 * ritim, varsayılan zaman, süre, birim, başlangıç ve finans ilişkisi.
 */
function ServiceForm({
  studentId,
  groups,
  disabled,
  onDone,
  run,
}: {
  studentId: string
  groups: { id: string; name: string }[]
  disabled?: boolean
  onDone: () => void
  run: (action: () => Promise<{ error?: string; success?: boolean }>, ok: string) => void
}) {
  const [kind, setKind] = useState<'ders' | 'kocluk'>('ders')
  const [participation, setParticipation] = useState<'birebir' | 'grup'>('birebir')
  const [medium, setMedium] = useState<'online' | 'yuz_yuze'>('online')
  const [groupId, setGroupId] = useState('')
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [cadence, setCadence] = useState<ServiceCadence>('haftada_1')
  const [weekday, setWeekday] = useState('3')
  const [startTime, setStartTime] = useState('20:00')
  const [weekday2, setWeekday2] = useState('6')
  const [startTime2, setStartTime2] = useState('20:00')
  const [duration, setDuration] = useState('60')
  const [unit, setUnit] = useState('1')
  const [startDate, setStartDate] = useState(() => todayDateString())
  const [financeLink, setFinanceLink] = useState<FinanceLink>('aylik_paket')

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <SegmentedField
          label="Hizmet"
          value={kind}
          onChange={setKind}
          disabled={disabled}
          options={[
            { value: 'ders', label: 'Ders' },
            { value: 'kocluk', label: 'Koçluk' },
          ]}
        />
        <SegmentedField
          label="Katılım"
          value={participation}
          onChange={(v) => {
            setParticipation(v)
            if (v === 'grup' && cadence === 'esnek') setCadence('haftada_1')
          }}
          disabled={disabled}
          options={[
            { value: 'birebir', label: 'Birebir' },
            { value: 'grup', label: 'Grup' },
          ]}
        />
        <SegmentedField
          label="Ortam"
          value={medium}
          onChange={setMedium}
          disabled={disabled}
          options={[
            { value: 'online', label: 'Online' },
            { value: 'yuz_yuze', label: 'Yüz yüze' },
          ]}
        />
      </div>

      {participation === 'grup' && (
        <div className="space-y-1.5">
          <Label htmlFor="serviceGroup">Grup</Label>
          <NativeSelect id="serviceGroup" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Seçin</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
          {newGroupOpen ? (
            <div className="mt-2 flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="newGroup" className="text-xs">
                  Yeni grup adı
                </Label>
                <Input
                  id="newGroup"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Örn. 12. Sınıf AYT Matematik Grubu"
                />
              </div>
              <Button
                size="sm"
                disabled={disabled || newGroupName.trim().length === 0}
                onClick={() => run(() => createStudentGroupAction(studentId, newGroupName.trim()), 'Grup oluşturuldu.')}
              >
                Ekle
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNewGroupOpen(false)}>
                Vazgeç
              </Button>
            </div>
          ) : (
            <Button size="xs" variant="ghost" className="mt-1 -ml-1" onClick={() => setNewGroupOpen(true)}>
              <Plus className="size-3.5" />
              Yeni grup oluştur
            </Button>
          )}
        </div>
      )}

      <RhythmFields
        idPrefix="new"
        cadence={cadence}
        setCadence={setCadence}
        weekday={weekday}
        setWeekday={setWeekday}
        startTime={startTime}
        setStartTime={setStartTime}
        weekday2={weekday2}
        setWeekday2={setWeekday2}
        startTime2={startTime2}
        setStartTime2={setStartTime2}
        duration={duration}
        setDuration={setDuration}
        unit={unit}
        setUnit={setUnit}
        allowFlexible={participation !== 'grup'}
        disabled={disabled}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="serviceStart">Başlangıç tarihi</Label>
          <Input id="serviceStart" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <SegmentedField
          label="Finans ilişkisi"
          value={financeLink}
          onChange={setFinanceLink}
          disabled={disabled}
          options={FINANCE_OPTIONS}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() =>
            run(async () => {
              const result = await createServiceAction({
                studentId,
                kind,
                participation,
                medium,
                groupId: participation === 'grup' ? groupId : '',
                cadence,
                weekday,
                startTime,
                weekday2: cadence === 'haftada_2' ? weekday2 : null,
                startTime2: cadence === 'haftada_2' ? startTime2 : null,
                plannedDurationMinutes: duration,
                defaultUnitCount: unit || '1',
                startDate,
                submissionOffsetMinutes: 0,
                financeLink,
              })
              if (result.success) onDone()
              return result
            }, 'Hizmet eklendi.')
          }
        >
          Hizmeti Ekle
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Vazgeç
        </Button>
      </div>
    </div>
  )
}

/**
 * Hizmet düzenleme — İLERİ TARİHLİ DEĞİŞİKLİK.
 *
 * TÜR / KATILIM / GRUP ALANLARI YOK: bu üç eksen hizmetin kimliğidir;
 * değişmesi gerekiyorsa o başka bir hizmettir (pasife al + yeni ekle ya
 * da üç nokta → Çoğalt).
 */
function ServiceEditForm({
  studentId,
  service,
  disabled,
  onSubmit,
  onCancel,
}: {
  studentId: string
  service: ServiceRow
  disabled?: boolean
  onSubmit: (input: ServiceUpdateInput) => void
  onCancel: () => void
}) {
  const [cadence, setCadence] = useState<ServiceCadence>(service.cadence)
  const [weekday, setWeekday] = useState(String(service.weekday))
  const [startTime, setStartTime] = useState(service.startTime.slice(0, 5))
  const [weekday2, setWeekday2] = useState(String(service.weekday2 ?? 6))
  const [startTime2, setStartTime2] = useState((service.startTime2 ?? service.startTime).slice(0, 5))
  const [duration, setDuration] = useState(String(service.plannedDurationMinutes))
  const [unit, setUnit] = useState(String(service.defaultUnitCount))
  const [medium, setMedium] = useState(service.medium)
  const [financeLink, setFinanceLink] = useState(service.financeLink)
  const [effectiveFrom, setEffectiveFrom] = useState(() => todayDateString())

  return (
    <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/40 p-3">
      <RhythmFields
        idPrefix={`edit-${service.id}`}
        cadence={cadence}
        setCadence={setCadence}
        weekday={weekday}
        setWeekday={setWeekday}
        startTime={startTime}
        setStartTime={setStartTime}
        weekday2={weekday2}
        setWeekday2={setWeekday2}
        startTime2={startTime2}
        setStartTime2={setStartTime2}
        duration={duration}
        setDuration={setDuration}
        unit={unit}
        setUnit={setUnit}
        allowFlexible={service.participation !== 'grup'}
        disabled={disabled}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`eff-${service.id}`}>Şu tarihten itibaren</Label>
          <Input
            id={`eff-${service.id}`}
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </div>
        <SegmentedField
          label="Ortam"
          value={medium}
          onChange={setMedium}
          disabled={disabled}
          options={[
            { value: 'online', label: 'Online' },
            { value: 'yuz_yuze', label: 'Yüz yüze' },
          ]}
        />
        <SegmentedField
          label="Finans ilişkisi"
          value={financeLink}
          onChange={setFinanceLink}
          disabled={disabled}
          options={FINANCE_OPTIONS}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Geçmiş kayıtlar değişmez. Bu tarihten sonraki, henüz sonuçlanmamış takvim oturumları yeni
        düzene göre yeniden üretilir; elle taşınmış ya da eklenmiş oturumlar korunur.
      </p>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() =>
            onSubmit({
              studentId,
              serviceId: service.id,
              cadence,
              weekday,
              startTime,
              weekday2: cadence === 'haftada_2' ? weekday2 : null,
              startTime2: cadence === 'haftada_2' ? startTime2 : null,
              defaultUnitCount: unit || '1',
              plannedDurationMinutes: duration,
              effectiveFrom,
              medium,
              submissionOffsetMinutes: service.submissionOffsetMinutes,
              financeLink,
            })
          }
        >
          Değişikliği Kaydet
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Vazgeç
        </Button>
      </div>
    </div>
  )
}
