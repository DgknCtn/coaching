'use client'

import { useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  formatSessionClock,
  formatSessionWeekdayShort,
  isAwaitingOutcome,
} from '@/lib/service-structure'
import { sessionDisplayStatus } from '@/lib/session-state'
import { formatKurus } from '@/lib/billing/pricing'
import {
  MONTH_COLUMN_LABEL,
  type MonthColumnKind,
  type MonthWeekRow,
} from '@/lib/month-sessions'
import {
  markDoneAndCollectAction,
  setGroupSessionOutcomeAction,
  setSessionOutcomeAction,
} from '@/app/(dashboard)/teacher/students/[studentId]/gorusmeler/actions'
import type { SessionRow } from '@/app/(dashboard)/teacher/students/[studentId]/gorusmeler/types'
import type { SessionMoney } from '@/components/sessions/week-sessions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { CalendarX } from 'lucide-react'
import { cn } from '@/lib/utils'

// DERS & GÖRÜŞMELER — AYLIK OPERASYON TABLOSU (M1.0-05).
//
// Varsayılan görünüm artık AY (eskiden hafta): ay içindeki haftalar
// SATIR, hizmet türü (Birebir Ders / Grup Dersi / Koçluk) SÜTUN olur.
// Gruplama/numaralandırma mantığı lib/month-sessions.ts'te SAF —
// burası yalnız onu çizer.
//
// HAFTALIK GÖRÜNÜM KALKMADI: her satırın "Bu haftaya git" bağlantısı
// hâlâ var olan WeekSessions ekranına açılır — reschedule, telafi
// kararı, iptal gibi daha seyrek işlemler o ekranda tam donanımlı
// kalır. Burada yalnız en sık işlem ("Yapıldı" / "Yapıldı + Tahsil
// Edildi") hücre içinde tek tıkla erişilir (PDF: "Görsellerdeki
// tik/buton yerleşimi öneridir; geliştirici daha sade teknik çözüm
// seçebilir" — tasarım serbestliği burada kullanıldı).

export function MonthSessions({
  weeks,
  columns,
  sessions,
  monthTitle,
  prevHref,
  nextHref,
  currentHref,
  isCurrentMonth,
  summary,
  nowIso,
  unpricedIds,
  quickCollectIds,
  money,
  academicWeekLabelByWeekKey,
  hasAnyService,
}: {
  weeks: MonthWeekRow[]
  columns: MonthColumnKind[]
  sessions: SessionRow[]
  monthTitle: string
  prevHref: string
  nextHref: string
  currentHref: string
  isCurrentMonth: boolean
  summary: React.ReactNode
  nowIso: string
  unpricedIds: string[]
  quickCollectIds: string[]
  money: Record<string, SessionMoney>
  /** "Öğrenciyle 3. Hafta" — hafta anahtarı başına, akış hiç açılmadıysa null. */
  academicWeekLabelByWeekKey: Record<string, string | null>
  hasAnyService: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const now = new Date(nowIso)
  const unpriced = useMemo(() => new Set(unpricedIds), [unpricedIds])
  const quickCollect = useMemo(() => new Set(quickCollectIds), [quickCollectIds])
  const sessionById = useMemo(() => new Map(sessions.map(s => [s.id, s])), [sessions])

  function act(action: () => Promise<{ error?: string; success?: boolean; amountKurus?: number }>, ok: string) {
    startTransition(async () => {
      const r = await action()
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success(ok)
      router.refresh()
    })
  }

  function markDone(row: SessionRow) {
    if (row.groupSessionId) {
      startTransition(async () => {
        const r = await setGroupSessionOutcomeAction(row.studentId, row.groupSessionId!, 'yapildi')
        if (r?.error) {
          toast.error(r.error)
          return
        }
        toast.success((r.affected ?? 0) > 0 ? `Grup dersi yapıldı · ${r.affected} öğrenciye yansıdı.` : 'Grup oturumu güncellendi.')
        router.refresh()
      })
      return
    }
    if (quickCollect.has(row.id)) {
      startTransition(async () => {
        const r = await markDoneAndCollectAction(row.studentId, row.id)
        if (r?.error) {
          toast.error(r.error)
          return
        }
        toast.success(`Yapıldı · ${formatKurus(r.amountKurus ?? 0)} tahsil edildi.`)
        router.refresh()
      })
      return
    }
    act(() => setSessionOutcomeAction(row.studentId, row.id, 'yapildi'), 'Yapıldı olarak kaydedildi.')
  }

  if (!hasAnyService) {
    return (
      <section className="rounded-xl border border-border bg-card">
        <MonthNav title={monthTitle} prevHref={prevHref} nextHref={nextHref} currentHref={currentHref} isCurrent={isCurrentMonth} />
        <div className="p-4">
          <EmptyState icon={CalendarX} title="Aktif hizmet yok" description="Hizmet Yapısı'ndan ders/koçluk düzeni tanımlanınca ay görünümü burada oluşur." />
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <MonthNav title={monthTitle} prevHref={prevHref} nextHref={nextHref} currentHref={currentHref} isCurrent={isCurrentMonth} />

      <div className="border-t border-border px-4 py-2 text-sm text-muted-foreground">{summary}</div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Hafta</th>
              {columns.map(col => (
                <th key={col} className="px-3 py-2 font-medium">
                  {MONTH_COLUMN_LABEL[col]}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {weeks.map(week => {
              const academicLabel = academicWeekLabelByWeekKey[week.weekKey] ?? null
              return (
                <tr key={week.weekKey} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <p className="font-medium">{week.ordinalLabel}</p>
                    <p className="text-xs text-muted-foreground">{week.rangeLabel}</p>
                    {academicLabel && (
                      <p className="text-xs text-muted-foreground/70">{academicLabel}</p>
                    )}
                  </td>
                  {columns.map(col => (
                    <td key={col} className="px-3 py-2">
                      <div className="space-y-1.5">
                        {week.cells[col].length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          week.cells[col].map(item => {
                            const row = sessionById.get(item.sessionId)
                            if (!row) return null
                            return (
                              <SessionCellLine
                                key={row.id}
                                row={row}
                                ordinal={item.ordinal}
                                now={now}
                                isPending={isPending}
                                fiyatsiz={unpriced.has(row.id)}
                                cash={row.status === 'yapildi' ? money[row.id] : undefined}
                                onMarkDone={() => markDone(row)}
                              />
                            )
                          })
                        )}
                      </div>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right align-top">
                    <Link
                      href={`?hafta=${week.weekKey}`}
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    >
                      Bu haftaya git
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function MonthNav({
  title,
  prevHref,
  nextHref,
  currentHref,
  isCurrent,
}: {
  title: string
  prevHref: string
  nextHref: string
  currentHref: string
  isCurrent: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3">
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" render={<Link href={prevHref} aria-label="Önceki ay" />}>
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className="min-w-32 text-center font-medium">{title}</h2>
        <Button size="icon-sm" variant="ghost" render={<Link href={nextHref} aria-label="Sonraki ay" />}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
      {!isCurrent && (
        <Link href={currentHref} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
          Bu aya dön
        </Link>
      )}
    </div>
  )
}

function SessionCellLine({
  row,
  ordinal,
  now,
  isPending,
  fiyatsiz,
  cash,
  onMarkDone,
}: {
  row: SessionRow
  ordinal: string | null
  now: Date
  isPending: boolean
  fiyatsiz: boolean
  cash: SessionMoney | undefined
  onMarkDone: () => void
}) {
  const awaiting = isAwaitingOutcome({ status: row.status, effectiveAt: new Date(row.currentPlannedAt) }, now)
  const display = sessionDisplayStatus(row)
  const due = cash ? cash.amountKurus - cash.paidKurus : 0

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {ordinal && <span className="tabular-nums text-muted-foreground">{ordinal}</span>}
      <span className="tabular-nums">
        {row.isMakeup && 'Telafi · '}
        {formatSessionWeekdayShort(row.currentPlannedAt)} {formatSessionClock(row.currentPlannedAt)}
      </span>
      {row.isExtra && <span className="text-muted-foreground">Ek ders</span>}

      {row.status === 'planlandi' ? (
        <Button
          size="xs"
          variant={awaiting ? 'default' : 'outline'}
          disabled={isPending}
          onClick={onMarkDone}
          className="h-5 px-1.5"
        >
          <Check className="size-3" />
        </Button>
      ) : (
        <Badge variant={display.variant} className="px-1.5 py-0 text-[10px]">
          {display.label}
        </Badge>
      )}

      {fiyatsiz && (
        <Badge variant="warning" className="px-1.5 py-0 text-[10px]" title="Bu tarihte geçerli fiyat yok.">
          Fiyatsız
        </Badge>
      )}
      {cash && (
        <span className={cn('tabular-nums', due > 0 ? 'text-warning-foreground' : 'text-success')}>
          {due > 0 ? `${formatKurus(due)} kalan` : 'tahsil edildi'}
        </span>
      )}
    </div>
  )
}
