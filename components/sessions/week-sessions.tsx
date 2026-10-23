'use client'

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus, Check, ChevronLeft, ChevronRight, MoreHorizontal, Plus } from 'lucide-react'
import {
  FINANCE_LINK_LABEL,
  formatSessionClock,
  formatSessionLong,
  formatSessionTime,
  isAwaitingOutcome,
  type FinanceLink,
} from '@/lib/service-structure'
import {
  MAKEUP_STATUS_LABEL,
  UNIT_PRESETS,
  formatUnits,
  planMoved,
  sessionDisplayStatus,
} from '@/lib/session-state'
import { dayKeyOf } from '@/lib/iso-week'
import { APP_TIME_ZONE } from '@/lib/homework-status'
import { formatKurus } from '@/lib/billing/pricing'
import {
  collectSessionAction,
  createAdhocSessionAction,
  createMakeupSessionAction,
  deleteAdhocSessionAction,
  listSessionPlanHistoryAction,
  markDoneAndCollectAction,
  moveActiveFlowDueAction,
  rescheduleSessionAction,
  setGroupSessionOutcomeAction,
  setMakeupDecisionAction,
  setSessionAttendanceAction,
  setSessionOutcomeAction,
} from '@/app/(dashboard)/teacher/students/[studentId]/gorusmeler/actions'
import type { SessionRow } from '@/app/(dashboard)/teacher/students/[studentId]/gorusmeler/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/shared/empty-state'
import { cn } from '@/lib/utils'

// ============================================================
// DERS & GÖRÜŞMELER V1 — HAFTALIK OPERASYON TABLOSU (M1.0-02 §4)
//
// "Bu ekran bir kayıt arşivi değil, haftalık operasyon ekranıdır: bugün
// kimle ne var, ne yapıldı, ne taşındı, ne telafi bekliyor?"
//
// İKİ YERDE AYNI BİLEŞEN: öğrenci sayfası (tek öğrencinin haftası) ve
// koç geneli /teacher/gorusmeler (herkesin haftası, Öğrenci sütunuyla).
// Ayrı iki tablo yazılsaydı satır davranışları (Yapıldı, telafi) bir gün
// ayrışırdı.
//
// DERS VE KOÇLUK AYRI TABLOLARA BÖLÜNMEZ: aynı haftada kronolojik akar.
//
// SATIR DETAYI SAĞ PANELDE: büyük modal zincirlerinden kaçınılır (§4
// "Hızlı kullanım"). Satır üzerinde tek tık "Yapıldı"; geri kalan her şey
// üç noktada ya da panelde.
// ============================================================

/** Tablonun hizmet hakkında bildiği her şey — para yok, yalnız ilişki. */
export interface WeekServiceInfo {
  id: string
  /** "Koçluk", "Ders", "Grup Dersi · 12 AYT" */
  label: string
  /** M1.0-05: birim gösterimi için ("1 ders" / "1 görüşme") — formatUnits. */
  kind: 'ders' | 'kocluk'
  participation: 'birebir' | 'grup'
  financeLink: FinanceLink
  defaultUnitCount: number
  plannedDurationMinutes: number
}

/** Oturumun tahakkuku ve FIFO'da ona düşen tahsilat (yalnız sahip). */
export interface SessionMoney {
  amountKurus: number
  paidKurus: number
}

export interface AddSessionTarget {
  studentId: string
  /** Yalnız aktif, birebir hizmetler — grup oturumu ortak kayıttır. */
  services: WeekServiceInfo[]
}

const dayLabelFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
})

/** `datetime-local` alanının beklediği yerel biçim. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function planText(row: SessionRow): string {
  if (!planMoved(row.plannedAt, row.currentPlannedAt)) {
    return formatSessionClock(row.currentPlannedAt)
  }
  const sameDay = dayKeyOf(row.plannedAt) === dayKeyOf(row.currentPlannedAt)
  const from = sameDay
    ? formatSessionClock(row.plannedAt)
    : `${shortDateFormatter.format(new Date(row.plannedAt))} ${formatSessionClock(row.plannedAt)}`
  const to = sameDay
    ? formatSessionClock(row.currentPlannedAt)
    : `${shortDateFormatter.format(new Date(row.currentPlannedAt))} ${formatSessionClock(row.currentPlannedAt)}`
  return `${from} → ${to}`
}

function actualText(row: SessionRow, kind: 'ders' | 'kocluk'): string {
  if (row.status !== 'yapildi') return '—'
  const parts = [row.actualAt ? formatSessionClock(row.actualAt) : null]
  if (row.durationMinutes) parts.push(`${row.durationMinutes} dk`)
  if (row.unitCount != null) parts.push(formatUnits(row.unitCount, kind))
  return parts.filter(Boolean).join(' · ')
}

export function WeekSessions({
  rows,
  services,
  weekTitle,
  prevHref,
  nextHref,
  currentHref,
  isCurrentWeek,
  hideWeekNav,
  nowIso,
  showStudent,
  addSession,
  summary,
  emptyTitle,
  emptyHint,
  unpricedIds,
  quickCollectIds,
  money,
  financeDetail,
}: {
  rows: SessionRow[]
  services: Record<string, WeekServiceInfo>
  weekTitle: string
  prevHref: string
  nextHref: string
  currentHref: string
  isCurrentWeek: boolean
  /**
   * M1.0-04 EKLE: "genel bekleyen telafiler" görünümü hafta kavramı
   * TAŞIMIYOR (tüm zamanlardaki bekleyen kararları listeliyor) — ‹ ›
   * "Bu hafta" gezinmesi orada anlamsız. VARSAYILAN false: iki mevcut
   * çağıran (öğrenci sayfası + bu sayfanın haftalık görünümü)
   * ETKİLENMEZ. `prevHref`/`nextHref`/`currentHref` yine de ZORUNLU
   * kalıyor — bu modda çağıran taraf boş string geçer, render edilmez.
   */
  hideWeekNav?: boolean
  nowIso: string
  showStudent: boolean
  addSession?: AddSessionTarget | null
  summary?: ReactNode
  /** Varsayılan "Bu hafta planlanmış oturum yok" — hafta kavramı taşımayan görünümlerde geçersiz kılınır. */
  emptyTitle?: string
  emptyHint?: string
  /**
   * Yapıldı ama ücret doğmamış oturumlar (fiyat tanımsız). Yalnız sahip
   * için hesaplanır; finansı göremeyen öğretmende boş gelir.
   */
  unpricedIds?: string[]
  /**
   * "Yapıldı + Tahsil Edildi" hızlı akışı açık oturumlar (ders başı +
   * ders sonrası tahsilat; Finans TEST 01). Yalnız sahip için dolu.
   */
  quickCollectIds?: string[]
  /** Oturum id → tahakkuk/tahsil; satırda "1.750 TL bekliyor". */
  money?: Record<string, SessionMoney>
  /** Sahip: üç noktada "Finans detayını aç". */
  financeDetail?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [detailId, setDetailId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState<null | 'session' | 'extra'>(null)

  const now = new Date(nowIso)
  const todayKey = dayKeyOf(now)
  const unpriced = useMemo(() => new Set(unpricedIds ?? []), [unpricedIds])
  const quickCollect = useMemo(() => new Set(quickCollectIds ?? []), [quickCollectIds])

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(a.currentPlannedAt).getTime() - new Date(b.currentPlannedAt).getTime() ||
          (a.studentName ?? '').localeCompare(b.studentName ?? '', 'tr')
      ),
    [rows]
  )
  const detail = detailId ? (rows.find((r) => r.id === detailId) ?? null) : null

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

  function markDone(row: SessionRow) {
    if (row.groupSessionId) {
      startTransition(async () => {
        const result = await setGroupSessionOutcomeAction(row.studentId, row.groupSessionId!, 'yapildi')
        if (result?.error) {
          toast.error(result.error)
          return
        }
        const n = result?.affected ?? 0
        toast.success(n > 0 ? `Grup dersi yapıldı · ${n} öğrenciye yansıdı.` : 'Grup oturumu güncellendi.')
        router.refresh()
      })
      return
    }
    run(() => setSessionOutcomeAction(row.studentId, row.id, 'yapildi'), 'Yapıldı olarak kaydedildi.')
  }

  // Normal olan tek tık: modal yok (Finans TEST 01 ürün ilkesi).
  function markDoneAndCollect(row: SessionRow) {
    startTransition(async () => {
      const r = await markDoneAndCollectAction(row.studentId, row.id)
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success(`Yapıldı · ${formatKurus(r.amountKurus ?? 0)} tahsil edildi.`)
      router.refresh()
    })
  }

  function collect(row: SessionRow) {
    startTransition(async () => {
      const r = await collectSessionAction(row.studentId, row.id)
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success(`${formatKurus(r.amountKurus ?? 0)} tahsil edildi.`)
      router.refresh()
    })
  }

  function markOutcome(row: SessionRow, status: 'yapilmadi' | 'iptal') {
    const ok = status === 'yapilmadi' ? 'Yapılmadı · telafi kararı bekliyor.' : 'İptal edildi.'
    if (row.groupSessionId) {
      run(() => setGroupSessionOutcomeAction(row.studentId, row.groupSessionId!, status), ok)
      return
    }
    run(() => setSessionOutcomeAction(row.studentId, row.id, status), ok)
  }

  // Gün başlıkları: tablo tek, günler satır gruplarıyla ayrılır.
  const groups: { key: string; label: string; rows: SessionRow[] }[] = []
  for (const row of sorted) {
    const key = dayKeyOf(row.currentPlannedAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.rows.push(row)
    else groups.push({ key, label: dayLabelFormatter.format(new Date(row.currentPlannedAt)), rows: [row] })
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-medium">{weekTitle}</h2>
          {summary && <div className="mt-1 text-xs text-muted-foreground">{summary}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {addSession && addSession.services.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => setAddOpen('session')}>
                <Plus className="size-4" />
                Oturum ekle
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddOpen('extra')}>
                Ek ders ekle
              </Button>
            </>
          )}
          {!hideWeekNav && (
            <>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={prevHref} />}>
                <ChevronLeft className="size-4" />
                <span className="sr-only">Önceki hafta</span>
              </Button>
              {!isCurrentWeek && (
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={currentHref} />}>
                  Bu hafta
                </Button>
              )}
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={nextHref} />}>
                <ChevronRight className="size-4" />
                <span className="sr-only">Sonraki hafta</span>
              </Button>
            </>
          )}
        </div>
      </header>

      {sorted.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={CalendarPlus}
            title={emptyTitle ?? 'Bu hafta planlanmış oturum yok'}
            description={emptyHint ?? 'Haftalık ritimli hizmetlerin oturumları takvimden otomatik üretilir.'}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Gün</th>
                {showStudent && <th className="px-3 py-2 text-left font-medium">Öğrenci</th>}
                <th className="px-3 py-2 text-left font-medium">Hizmet</th>
                <th className="px-3 py-2 text-left font-medium">Plan</th>
                <th className="hidden px-3 py-2 text-left font-medium md:table-cell">Gerçekleşme</th>
                <th className="px-3 py-2 text-left font-medium">Durum</th>
                <th className="hidden px-3 py-2 text-left font-medium lg:table-cell">Finans</th>
                <th className="px-3 py-2 text-right font-medium">
                  <span className="sr-only">İşlemler</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) =>
                g.rows.map((row, i) => {
                  const service = services[row.serviceId]
                  const awaiting = isAwaitingOutcome(
                    { status: row.status, effectiveAt: new Date(row.currentPlannedAt) },
                    now
                  )
                  const display = sessionDisplayStatus(row)
                  const isToday = g.key === todayKey
                  const fast = quickCollect.has(row.id)
                  const cash = row.status === 'yapildi' ? money?.[row.id] : undefined
                  const due = cash ? cash.amountKurus - cash.paidKurus : 0
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-b border-border last:border-0',
                        isToday && 'bg-primary/5',
                        i === 0 && 'border-t border-border'
                      )}
                    >
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        {i === 0 ? (
                          <span className={cn('font-medium', isToday && 'text-primary')}>
                            {g.label}
                            {isToday && <span className="ml-1 text-xs font-normal">· Bugün</span>}
                          </span>
                        ) : null}
                      </td>
                      {showStudent && (
                        <td className="px-3 py-2 align-top">
                          <Link
                            href={`/teacher/students/${row.studentId}/gorusmeler`}
                            className="hover:underline"
                          >
                            {row.studentName ?? '—'}
                          </Link>
                        </td>
                      )}
                      <td className="px-3 py-2 align-top">
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => setDetailId(row.id)}
                        >
                          {row.isMakeup && 'Telafi · '}
                          {service?.label ?? 'Hizmet'}
                          {row.isExtra && <span className="text-muted-foreground"> · Ek ders</span>}
                        </button>
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap tabular-nums">
                        {planText(row)}
                        {row.durationMinutes && row.status !== 'yapildi' && (
                          <span className="text-muted-foreground"> · {row.durationMinutes} dk</span>
                        )}
                      </td>
                      <td className="hidden px-3 py-2 align-top whitespace-nowrap tabular-nums text-muted-foreground md:table-cell">
                        {actualText(row, service?.kind ?? 'ders')}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {awaiting ? (
                          <Badge variant="warning">Durum güncellenmedi</Badge>
                        ) : (
                          <Badge variant={display.variant}>{display.label}</Badge>
                        )}
                        {row.groupSessionId && row.attended === false && (
                          <span className="ml-1 text-xs text-muted-foreground">Katılmadı</span>
                        )}
                        {unpriced.has(row.id) && (
                          <Badge
                            variant="warning"
                            className="ml-1"
                            title="Bu tarihte geçerli fiyat yok; ders finansa yansımadı. Hizmet Modeli'nden fiyat girin."
                          >
                            Fiyatsız
                          </Badge>
                        )}
                        {cash && (
                          <span
                            className={cn(
                              'ml-1 text-xs whitespace-nowrap tabular-nums',
                              due > 0 ? 'text-warning-foreground' : 'text-success'
                            )}
                          >
                            {due > 0
                              ? `| ${formatKurus(cash.amountKurus)} bekliyor${cash.paidKurus > 0 ? ` · ${formatKurus(due)} kalan` : ''}`
                              : `| ${formatKurus(cash.amountKurus)} tahsil edildi`}
                          </span>
                        )}
                      </td>
                      <td className="hidden px-3 py-2 align-top text-xs text-muted-foreground lg:table-cell">
                        {service ? FINANCE_LINK_LABEL[service.financeLink] : '—'}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center justify-end gap-1">
                          {row.status === 'planlandi' && fast && (
                            <>
                              <Button
                                size="xs"
                                variant={awaiting ? 'default' : 'outline'}
                                disabled={isPending}
                                onClick={() => markDoneAndCollect(row)}
                              >
                                <Check className="size-3.5" />
                                Yapıldı + Tahsil Edildi
                              </Button>
                              <Button size="xs" variant="ghost" disabled={isPending} onClick={() => markDone(row)}>
                                Yalnız Yapıldı
                              </Button>
                            </>
                          )}
                          {row.status === 'planlandi' && !fast && (
                            <Button
                              size="xs"
                              variant={awaiting ? 'default' : 'outline'}
                              disabled={isPending}
                              onClick={() => markDone(row)}
                            >
                              <Check className="size-3.5" />
                              Yapıldı
                            </Button>
                          )}
                          {fast && cash && due > 0 && (
                            <Button size="xs" variant="outline" disabled={isPending} onClick={() => collect(row)}>
                              Tahsil edildi
                            </Button>
                          )}
                          <RowMenu
                            row={row}
                            disabled={isPending}
                            financeHref={financeDetail ? `/teacher/finans/${row.studentId}` : null}
                            onOpenDetail={() => setDetailId(row.id)}
                            onOutcome={(s) => markOutcome(row, s)}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <SessionDetailPanel
        row={detail}
        service={detail ? services[detail.serviceId] : undefined}
        unpriced={detail ? unpriced.has(detail.id) : false}
        onClose={() => setDetailId(null)}
      />

      {/* Yalnız açıkken mount: hizmet listesi sayfa yenilenince değişebilir
          (ör. hizmet aynı sayfada aktifleştirildi); kalıcı mount ilk render'daki
          boş serviceId'yi saklıyor ve "Hizmet seçin" hatası veriyordu (TEST 02). */}
      {addSession && addOpen && (
        <AddSessionDialog
          mode={addOpen}
          target={addSession}
          onClose={() => setAddOpen(null)}
        />
      )}
    </section>
  )
}

function RowMenu({
  row,
  disabled,
  financeHref,
  onOpenDetail,
  onOutcome,
}: {
  row: SessionRow
  disabled: boolean
  /** Finansal istisnalar (tutar, tahsilat tarihi, tahsilatı kaldırma) orada. */
  financeHref: string | null
  onOpenDetail: () => void
  onOutcome: (status: 'yapilmadi' | 'iptal') => void
}) {
  const open = row.status === 'planlandi'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Oturum işlemleri"
        disabled={disabled}
        className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {open && !row.groupSessionId && (
          <DropdownMenuItem onClick={onOpenDetail}>Planı değiştir</DropdownMenuItem>
        )}
        {open && <DropdownMenuItem onClick={() => onOutcome('yapilmadi')}>Yapılmadı</DropdownMenuItem>}
        {open && <DropdownMenuItem onClick={() => onOutcome('iptal')}>İptal edildi</DropdownMenuItem>}
        {open && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={onOpenDetail}>Gerçekleşme detayını düzenle</DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenDetail}>Not ekle</DropdownMenuItem>
        {financeHref && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href={financeHref} />}>Finans detayını aç</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ============================================================
// SAĞ PANEL — satır detayı
// ============================================================

function SessionDetailPanel({
  row,
  service,
  unpriced,
  onClose,
}: {
  row: SessionRow | null
  service: WeekServiceInfo | undefined
  unpriced: boolean
  onClose: () => void
}) {
  return (
    <Drawer open={row !== null} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent className="max-w-lg">
        {row && (
          <SessionDetailBody
            key={row.id + row.status + row.currentPlannedAt}
            row={row}
            service={service}
            unpriced={unpriced}
            onClose={onClose}
          />
        )}
      </DrawerContent>
    </Drawer>
  )
}

function SessionDetailBody({
  row,
  service,
  unpriced,
  onClose,
}: {
  row: SessionRow
  service: WeekServiceInfo | undefined
  unpriced: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [history, setHistory] = useState<
    { id: string; oldPlannedAt: string; newPlannedAt: string; note: string | null }[] | null
  >(null)

  const planDate = new Date(row.currentPlannedAt)
  const [doneAt, setDoneAt] = useState(() => toLocalInputValue(row.actualAt ? new Date(row.actualAt) : planDate))
  const [duration, setDuration] = useState(
    String(row.durationMinutes ?? service?.plannedDurationMinutes ?? 60)
  )
  const initialUnit = String(row.unitCount ?? service?.defaultUnitCount ?? 1)
  const [unit, setUnit] = useState(initialUnit)
  // M1.0-05: Koçluk kullanıcı dilinde "görüşme" — iç 0,5/1/1,5/2 birim
  // altyapısı aynı kalıyor, yalnız bu formun etiketleri değişiyor.
  const unitWord = service?.kind === 'kocluk' ? 'görüşme' : 'ders'
  const [note, setNote] = useState(row.note ?? '')
  const [cancelReason, setCancelReason] = useState(row.cancelReason ?? '')
  const [newPlan, setNewPlan] = useState(() => toLocalInputValue(planDate))
  const [planNote, setPlanNote] = useState('')
  const [makeupAt, setMakeupAt] = useState(() => toLocalInputValue(new Date(planDate.getTime() + 7 * 86_400_000)))

  useEffect(() => {
    let alive = true
    listSessionPlanHistoryAction(row.id).then((r) => {
      if (alive && 'rows' in r && r.rows) setHistory(r.rows)
    })
    return () => {
      alive = false
    }
  }, [row.id])

  function done(ok: string, close = false) {
    toast.success(ok)
    router.refresh()
    if (close) onClose()
  }

  function act(action: () => Promise<{ error?: string; success?: boolean }>, ok: string, close = false) {
    startTransition(async () => {
      const r = await action()
      if (r?.error) {
        toast.error(r.error)
        return
      }
      done(ok, close)
    })
  }

  const unitNumber = Number(unit.replace(',', '.'))
  const presets = UNIT_PRESETS.map(String)
  const customUnit = !presets.includes(unit)

  function saveDone() {
    if (!Number.isFinite(unitNumber) || unitNumber <= 0) {
      toast.error(`Geçerli bir ${unitWord} birimi girin.`)
      return
    }
    const when = new Date(doneAt)
    act(
      () =>
        setSessionOutcomeAction(row.studentId, row.id, 'yapildi', note, {
          actualAtIso: Number.isNaN(when.getTime()) ? null : when.toISOString(),
          durationMinutes: Number(duration) || null,
          unitCount: unitNumber,
        }),
      'Gerçekleşme kaydedildi.',
      true
    )
  }

  function reschedule() {
    const when = new Date(newPlan)
    if (Number.isNaN(when.getTime())) {
      toast.error('Geçerli bir tarih ve saat girin.')
      return
    }
    startTransition(async () => {
      const result = await rescheduleSessionAction(row.studentId, row.id, when.toISOString(), planNote)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      toast.success('Plan değişti; ilk plan geçmişte korunuyor.')
      // R7/05 kabul #11: ana temas taşındıysa aktif akışın son teslimi
      // SORULUR, kendiliğinden taşınmaz.
      const move = result?.moveDue
      if (move?.kind === 'locked') {
        toast.info(
          `Haftanın son teslimi özel seçilmiş (${formatSessionLong(move.currentDueAt)}); bu değişiklik onu değiştirmedi.`,
          { duration: 8000 }
        )
      } else if (move?.kind === 'ask') {
        const yes = window.confirm(
          'Ana temas taşındı. Aktif Haftalık Akış’ın son teslimi de taşınsın mı?\n\n' +
            `Şu an: ${formatSessionLong(move.currentDueAt)}\n` +
            `Yeni:  ${formatSessionLong(move.proposedDueAt)}`
        )
        if (yes) {
          const moved = await moveActiveFlowDueAction(row.studentId, move.flowId, move.proposedDueAt)
          if (moved?.error) toast.error(moved.error)
          else toast.success('Haftanın son teslimi de taşındı.')
        }
      }
      router.refresh()
    })
  }

  const display = sessionDisplayStatus(row)
  const isGroup = row.groupSessionId !== null
  const canDecideMakeup = row.status === 'yapilmadi' && !row.isMakeup

  return (
    <>
      <DrawerHeader>
        <DrawerTitle>
          {row.isMakeup && 'Telafi · '}
          {service?.label ?? 'Oturum'}
          {row.isExtra && ' · Ek ders'}
        </DrawerTitle>
        <DrawerDescription>
          {row.studentName ? `${row.studentName} · ` : ''}
          {formatSessionLong(row.currentPlannedAt)}
        </DrawerDescription>
      </DrawerHeader>

      <DrawerBody className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={display.variant}>{display.label}</Badge>
          {service && (
            <span className="text-xs text-muted-foreground">{FINANCE_LINK_LABEL[service.financeLink]}</span>
          )}
          {row.isMakeup && row.originPlannedAt && (
            <span className="text-xs text-muted-foreground">
              {formatSessionLong(row.originPlannedAt)} dersinin telafisi
            </span>
          )}
        </div>

        {unpriced && (
          <p className="rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning-foreground">
            Bu ders finansa yansımadı: gerçekleşme tarihinde geçerli bir fiyat yok. Öğrencinin Hizmet
            Modeli&apos;nden fiyat girildiğinde eksik tahakkuk kendiliğinden açılır.
          </p>
        )}

        {/* PLAN — ilk plan, güncel plan ve geçmiş (§4 "Plan ve gerçekleşme ayrılacak") */}
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Plan</h3>
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
            <dt className="text-muted-foreground">İlk plan</dt>
            <dd>{formatSessionTime(row.plannedAt)}</dd>
            {planMoved(row.plannedAt, row.currentPlannedAt) && (
              <>
                <dt className="text-muted-foreground">Güncel plan</dt>
                <dd>{formatSessionTime(row.currentPlannedAt)}</dd>
              </>
            )}
            {row.status === 'yapildi' && (
              <>
                <dt className="text-muted-foreground">Gerçekleşme</dt>
                <dd>{actualText(row, service?.kind ?? 'ders')}</dd>
              </>
            )}
          </dl>
          {history && history.length > 0 && (
            <ol className="space-y-0.5 border-l border-border pl-3 text-xs text-muted-foreground">
              {history.map((h) => (
                <li key={h.id}>
                  {formatSessionTime(h.oldPlannedAt)} → {formatSessionTime(h.newPlannedAt)}
                  {h.note && ` · ${h.note}`}
                </li>
              ))}
            </ol>
          )}
          {row.status === 'planlandi' && !isGroup && (
            <div className="space-y-2 rounded-md border border-border p-2">
              <Label htmlFor="newPlan" className="text-xs">
                Planı değiştir
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="newPlan"
                  type="datetime-local"
                  value={newPlan}
                  onChange={(e) => setNewPlan(e.target.value)}
                  className="h-8 w-52"
                />
                <Input
                  aria-label="Değişiklik notu"
                  placeholder="Not (isteğe bağlı)"
                  value={planNote}
                  onChange={(e) => setPlanNote(e.target.value)}
                  className="h-8 flex-1"
                />
                <Button size="sm" variant="outline" disabled={isPending} onClick={reschedule}>
                  Kaydet
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Tek seferlik değişiklik Hizmet Yapısını değiştirmez; oturum &quot;Planlandı&quot; kalır.
              </p>
            </div>
          )}
        </section>

        {/* GERÇEKLEŞME — Yapıldı paneli (§4) */}
        {!isGroup && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">
              {row.status === 'yapildi' ? 'Gerçekleşmeyi düzelt' : 'Yapıldı olarak kaydet'}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="doneAt" className="text-xs">
                  Gerçek tarih ve başlangıç
                </Label>
                <Input id="doneAt" type="datetime-local" value={doneAt} onChange={(e) => setDoneAt(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="doneDuration" className="text-xs">
                  Gerçek süre (dk)
                </Label>
                <Input
                  id="doneDuration"
                  type="number"
                  min={5}
                  max={600}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium capitalize">{unitWord} birimi</span>
              <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={`${unitWord} birimi`}>
                {presets.map((p) => (
                  <Button
                    key={p}
                    size="xs"
                    role="radio"
                    aria-checked={unit === p}
                    variant={unit === p ? 'default' : 'outline'}
                    onClick={() => setUnit(p)}
                  >
                    {p.replace('.', ',')}
                  </Button>
                ))}
                <Button
                  size="xs"
                  role="radio"
                  aria-checked={customUnit}
                  variant={customUnit ? 'default' : 'outline'}
                  onClick={() => setUnit(customUnit ? unit : '')}
                >
                  Özel
                </Button>
                {customUnit && (
                  <Input
                    aria-label={`Özel ${unitWord} birimi`}
                    inputMode="decimal"
                    className="h-7 w-20"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="2,5"
                  />
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="doneNote" className="text-xs">
                Not
              </Label>
              <Textarea id="doneNote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={isPending} onClick={saveDone}>
                <Check className="size-4" />
                {row.status === 'yapildi' ? 'Güncelle' : 'Yapıldı'}
              </Button>
              {row.status === 'planlandi' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() =>
                      act(
                        () => setSessionOutcomeAction(row.studentId, row.id, 'yapilmadi', note),
                        'Yapılmadı · telafi kararı bekliyor.'
                      )
                    }
                  >
                    Yapılmadı
                  </Button>
                </>
              )}
              {row.status !== 'planlandi' && row.status !== 'iptal' && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() =>
                    act(() => setSessionOutcomeAction(row.studentId, row.id, 'planlandi'), 'Oturum yeniden planlandı.')
                  }
                >
                  Sonucu geri al
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Ders planlanan saatten önce yapıldıysa da Yapıldı kaydedilebilir.
            </p>
          </section>
        )}

        {isGroup && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Grup oturumu</h3>
            <p className="text-xs text-muted-foreground">
              Grup dersinin sonucu tek işlemle tüm gruba yansır (satırdaki Yapıldı ve üç nokta).
            </p>
            {row.status === 'yapildi' && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  act(
                    () => setSessionAttendanceAction(row.studentId, row.id, row.attended === false),
                    row.attended === false ? 'Katılım geri alındı.' : 'Katılmadı olarak işaretlendi.'
                  )
                }
              >
                {row.attended === false ? 'Katıldı olarak düzelt' : 'Bu öğrenci katılmadı'}
              </Button>
            )}
          </section>
        )}

        {/* İPTAL */}
        {row.status === 'planlandi' && !isGroup && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">İptal edildi</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="İptal nedeni"
                placeholder="Neden (isteğe bağlı)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="h-8 flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  act(
                    () =>
                      setSessionOutcomeAction(row.studentId, row.id, 'iptal', note, {
                        cancelReason: cancelReason || null,
                      }),
                    'İptal edildi.',
                    true
                  )
                }
              >
                İptal et
              </Button>
            </div>
          </section>
        )}
        {row.status === 'iptal' && row.cancelReason && (
          <p className="text-xs text-muted-foreground">İptal nedeni: {row.cancelReason}</p>
        )}

        {/* TELAFİ (§5) — durum elle yönetilmez, olaylardan türer */}
        {canDecideMakeup && (
          <section className="space-y-2 rounded-md border border-warning-border bg-warning-subtle p-3">
            <h3 className="text-sm font-medium">{MAKEUP_STATUS_LABEL[row.makeupStatus] || 'Telafi'}</h3>
            {(row.makeupStatus === 'decision_pending' || row.makeupStatus === 'not_required') && (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Telafi tarihi"
                  type="datetime-local"
                  value={makeupAt}
                  onChange={(e) => setMakeupAt(e.target.value)}
                  className="h-8 w-52"
                />
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    const when = new Date(makeupAt)
                    if (Number.isNaN(when.getTime())) {
                      toast.error('Geçerli bir tarih ve saat girin.')
                      return
                    }
                    act(
                      () => createMakeupSessionAction(row.studentId, row.id, when.toISOString()),
                      'Telafi planlandı.'
                    )
                  }}
                >
                  Telafi tarihi ver
                </Button>
              </div>
            )}
            {row.makeupStatus === 'decision_pending' && (
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() =>
                  act(() => setMakeupDecisionAction(row.studentId, row.id, 'waived'), 'Telafi edilmeyecek.')
                }
              >
                Telafi edilmeyecek
              </Button>
            )}
            {row.makeupStatus === 'not_required' && (
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() =>
                  act(() => setMakeupDecisionAction(row.studentId, row.id, 'pending'), 'Karar geri alındı.')
                }
              >
                Kararı geri al
              </Button>
            )}
            {(row.makeupStatus === 'planned' || row.makeupStatus === 'completed') && (
              <p className="text-xs text-muted-foreground">
                Telafi oturumu bu kayda bağlı; sonucu kendi satırından işaretlenir. Finans aynı hizmeti
                iki kez saymaz.
              </p>
            )}
          </section>
        )}

        {row.source === 'elle' && row.status === 'planlandi' && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={isPending}
            onClick={() => {
              if (!window.confirm('Elle eklenen bu oturum silinsin mi?')) return
              act(() => deleteAdhocSessionAction(row.studentId, row.id), 'Oturum silindi.', true)
            }}
          >
            Yanlış eklendi, sil
          </Button>
        )}
      </DrawerBody>
    </>
  )
}

// ============================================================
// OTURUM / EK DERS EKLE
// ============================================================

function AddSessionDialog({
  mode,
  target,
  onClose,
}: {
  mode: null | 'session' | 'extra'
  target: AddSessionTarget
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pickedServiceId, setServiceId] = useState(target.services[0]?.id ?? '')
  // Seçili id listede yoksa ilk hizmete düş — <select> görsel olarak zaten onu gösterir.
  const serviceId = target.services.some((s) => s.id === pickedServiceId)
    ? pickedServiceId
    : (target.services[0]?.id ?? '')
  const [when, setWhen] = useState(() => {
    const d = new Date()
    d.setMinutes(0, 0, 0)
    return toLocalInputValue(d)
  })
  const service = target.services.find((s) => s.id === serviceId)
  const [duration, setDuration] = useState('')

  function submit() {
    const at = new Date(when)
    if (!serviceId) {
      toast.error('Hizmet seçin.')
      return
    }
    if (!when || Number.isNaN(at.getTime())) {
      toast.error('Tarih ve saati tam girin.')
      return
    }
    startTransition(async () => {
      const r = await createAdhocSessionAction({
        studentId: target.studentId,
        serviceId,
        plannedAtIso: at.toISOString(),
        isExtra: mode === 'extra',
        durationMinutes: duration ? Number(duration) : null,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(mode === 'extra' ? 'Ek ders eklendi.' : 'Oturum eklendi.')
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open={mode !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'extra' ? 'Ek ders ekle' : 'Oturum ekle'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="addService">Hizmet</Label>
            <NativeSelect id="addService" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {target.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="addWhen">Tarih ve saat</Label>
              <Input id="addWhen" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addDuration">Süre (dk)</Label>
              <Input
                id="addDuration"
                type="number"
                min={5}
                max={600}
                placeholder={String(service?.plannedDurationMinutes ?? 60)}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === 'extra'
              ? 'Ek ders, aylık sabit modelde öğrencinin ek ders fiyatıyla; ders başı modelde aynı birim fiyatıyla ücretlenir. Ücret ders Yapıldı işaretlenince oluşur.'
              : 'Takvim dışı oturum (esnek ritim). Geçmiş bir tarih de girilebilir; ardından Yapıldı işaretleyin.'}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button disabled={isPending} onClick={submit}>
            Ekle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
