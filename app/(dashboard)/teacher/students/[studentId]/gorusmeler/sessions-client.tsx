'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Clock, Settings2, Users, Wallet } from 'lucide-react'
import { formatKurus } from '@/lib/billing/pricing'
import { formatMinutes, parseLiraToKurus } from '@/lib/finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Section } from '@/components/shared/section'
import { EmptyState } from '@/components/shared/empty-state'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { WeekSessions, type WeekServiceInfo } from '@/components/sessions/week-sessions'
import {
  FINANCE_LINK_LABEL,
  formatServiceAxes,
  formatServiceSchedule,
  formatSessionTime,
} from '@/lib/service-structure'
import { formatUnits } from '@/lib/session-state'
import { ServiceStructureDrawer, type DrawerStudent } from './service-structure-drawer'
import { resolvePaymentNoticeAction } from './actions'
import type { FinanceModelInfo, ServiceRow, SessionRow } from './types'

export type { ServiceRow, SessionRow } from './types'

export interface SeasonSummary {
  birebirDersCount: number
  birebirDersMinutes: number
  grupDersCount: number
  grupDersMinutes: number
  koclukCount: number
  koclukMinutes: number
  totalCount: number
  totalMinutes: number
  /** null = finans tablolarını görme yetkisi yok (066: yalnız 'owner'). */
  accruedKurus: number | null
  collectedKurus: number | null
  balanceKurus: number | null
}

export interface ArchiveMonth {
  month: string
  label: string
  /** O ayın ilk haftası — arşivden haftalık görünüme atlamak için. */
  weekParam: string
  planned: number
  done: number
  missed: number
}

/** §5 "Aylık hizmet özeti" — paket hakkı değil, ayın planlanan/gerçekleşen durumu. */
export interface MonthSummary {
  monthLabel: string
  dersDone: number
  dersPlanned: number
  koclukDone: number
  koclukPlanned: number
  makeupPending: number
  extra: number
}

function summaryLine(s: MonthSummary): string {
  const parts: string[] = []
  if (s.dersPlanned > 0) parts.push(`Ders ${s.dersDone}/${s.dersPlanned} yapıldı`)
  if (s.koclukPlanned > 0) parts.push(`Koçluk ${s.koclukDone}/${s.koclukPlanned} yapıldı`)
  if (s.makeupPending > 0) parts.push(`Telafi ${s.makeupPending} bekliyor`)
  if (s.extra > 0) parts.push(`Ek ders ${s.extra}`)
  return parts.length ? `${s.monthLabel}: ${parts.join(' · ')}` : `${s.monthLabel}: planlanmış hizmet yok`
}

/**
 * Ders & Görüşmeler — öğrenci sayfasının etkileşim katmanı (M1.0-02).
 *
 * Üstte Hizmet Yapısı ÖZETİ (vaat), ortada HAFTA (gerçekleşen), altta ay
 * arşivi ve sezon özeti. Para toplamı burada yapılmaz; Finans ekranına
 * bağlantı verilir.
 */
export function SessionsClient({
  studentId,
  student,
  services,
  serviceInfo,
  sessions,
  groups,
  week,
  monthSummary,
  archive,
  mainContactId,
  nextContactAt,
  nowIso,
  finance,
  financeHref,
  paymentNotice,
  season,
}: {
  studentId: string
  student: DrawerStudent
  services: ServiceRow[]
  serviceInfo: Record<string, WeekServiceInfo>
  sessions: SessionRow[]
  groups: { id: string; name: string }[]
  week: { title: string; prevHref: string; nextHref: string; currentHref: string; isCurrent: boolean }
  monthSummary: MonthSummary
  archive: ArchiveMonth[]
  mainContactId: string | null
  nextContactAt: string | null
  nowIso: string
  finance: FinanceModelInfo | null
  financeHref: string | null
  paymentNotice: { id: string; note: string | null; createdAt: string } | null
  season: SeasonSummary | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [structureOpen, setStructureOpen] = useState(false)

  const active = services.filter((s) => s.status === 'active')

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

  return (
    <div className="space-y-6">
      {/* ---------------- Hizmet Yapısı · özet (§3) ---------------- */}
      <Section
        title="Hizmet Yapısı"
        description="Bu öğrenciyle çalışma düzeni. Gün ve saat haftalık planlama için varsayılandır."
        variant="card"
        action={
          <Button size="sm" variant="outline" onClick={() => setStructureOpen(true)}>
            <Settings2 className="size-4" />
            Düzenle
          </Button>
        }
      >
        {active.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Aktif hizmet yok"
            description="Öğrencinin ders ve koçluk düzenini tanımlayın. Haftalık Akış bu düzenden beslenir."
            action={{ label: 'Hizmet Ekle', onClick: () => setStructureOpen(true) }}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {active.map((service) => (
              <li key={service.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {formatServiceAxes(service)}
                      {service.groupName && <span className="text-muted-foreground"> · {service.groupName}</span>}
                    </p>
                    <p className="mt-0.5 text-muted-foreground">{formatServiceSchedule(service)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {FINANCE_LINK_LABEL[service.financeLink]} · {formatUnits(service.defaultUnitCount)}
                    </p>
                  </div>
                  {service.id === mainContactId && <Badge variant="info">Ana temas</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {nextContactAt && (
          <p className="mt-3 text-xs text-muted-foreground">Sıradaki temas: {formatSessionTime(nextContactAt)}</p>
        )}
      </Section>

      <ServiceStructureDrawer
        open={structureOpen}
        onOpenChange={setStructureOpen}
        student={student}
        services={services}
        groups={groups}
        mainContactId={mainContactId}
        finance={finance}
      />

      {/* VELİ BİLDİRİMİ (§8) — para kaydı değil; tutar girilirse tahsilat doğar. */}
      {paymentNotice && (
        <PaymentNoticeCard
          notice={paymentNotice}
          disabled={isPending}
          onResolve={(status, amountKurus) =>
            run(
              () => resolvePaymentNoticeAction(studentId, paymentNotice.id, status, amountKurus),
              status === 'confirmed' ? 'Bildirim onaylandı.' : 'Bildirim reddedildi.'
            )
          }
        />
      )}

      {/* ---------------- Hafta (§4) ---------------- */}
      <WeekSessions
        rows={sessions}
        services={serviceInfo}
        weekTitle={week.title}
        prevHref={week.prevHref}
        nextHref={week.nextHref}
        currentHref={week.currentHref}
        isCurrentWeek={week.isCurrent}
        nowIso={nowIso}
        showStudent={false}
        summary={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            {summaryLine(monthSummary)}
            {financeHref && (
              <Link href={financeHref} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                <Wallet className="size-3" />
                Finans detayı
              </Link>
            )}
          </span>
        }
        addSession={{
          studentId,
          services: active
            .filter((s) => s.participation === 'birebir')
            .map((s) => serviceInfo[s.id])
            .filter(Boolean),
        }}
        emptyHint={
          active.some((s) => s.cadence === 'esnek')
            ? 'Esnek ritimli hizmetin oturumlarını "Oturum ekle" ile girin.'
            : undefined
        }
      />

      {/* ---------------- Geçmiş aylar ---------------- */}
      {archive.length > 0 && (
        <Section title="Geçmiş Aylar" description="Aylık hizmet kayıtları silinmez; arşivlenir." variant="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Ay</th>
                  <th className="px-3 py-2 text-right font-medium">Planlanan</th>
                  <th className="px-3 py-2 text-right font-medium">Yapılan</th>
                  <th className="px-3 py-2 text-right font-medium">Yapılmadı</th>
                </tr>
              </thead>
              <tbody>
                {archive.map((m) => (
                  <tr key={m.month} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`?hafta=${m.weekParam}`} className="hover:underline">
                        {m.label}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.planned}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.done}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.missed || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ---------------- Sezon özeti (§9 R7) ---------------- */}
      {season && season.totalCount > 0 && (
        <Section
          title="Sezon Özeti"
          description="Aktif eğitim döneminde gerçekleşen hizmetlerin toplamı."
          variant="card"
        >
          <MetricTiles
            className={season.accruedKurus !== null ? 'xl:grid-cols-4' : 'xl:grid-cols-2'}
            metrics={[
              { label: 'Toplam temas', value: season.totalCount, icon: Users },
              { label: 'Toplam süre', value: formatMinutes(season.totalMinutes), icon: Clock },
              ...(season.accruedKurus !== null
                ? [
                    { label: 'Toplam tahakkuk', value: formatKurus(season.accruedKurus), icon: Wallet },
                    {
                      label: 'Tahsil edilen',
                      value: formatKurus(season.collectedKurus ?? 0),
                      icon: Wallet,
                      tone: (season.balanceKurus ?? 0) > 0 ? ('warning' as const) : ('success' as const),
                      hint:
                        (season.balanceKurus ?? 0) > 0
                          ? `${formatKurus(season.balanceKurus ?? 0)} kaldı`
                          : (season.balanceKurus ?? 0) < 0
                            ? `${formatKurus(-(season.balanceKurus ?? 0))} alacaklı`
                            : undefined,
                    },
                  ]
                : []),
            ]}
          />
          <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <SeasonStat label="Birebir ders" count={season.birebirDersCount} minutes={season.birebirDersMinutes} unit="oturum" />
            <SeasonStat label="Grup dersi" count={season.grupDersCount} minutes={season.grupDersMinutes} unit="oturum" />
            <SeasonStat label="Koçluk" count={season.koclukCount} minutes={season.koclukMinutes} unit="görüşme" />
          </dl>
        </Section>
      )}
    </div>
  )
}

/**
 * Velinin bekleyen ödeme bildirimi.
 *
 * TUTAR ALANI BOŞ BAŞLAR VE ZORUNLU DEĞİL: buraya yazılan sayı
 * öğretmenin kendi beyanı ve yazıldığı anda tahsilat satırı doğuruyor.
 */
function PaymentNoticeCard({
  notice,
  disabled,
  onResolve,
}: {
  notice: { id: string; note: string | null; createdAt: string }
  disabled?: boolean
  onResolve: (status: 'confirmed' | 'rejected', amountKurus: number | null) => void
}) {
  const [amount, setAmount] = useState('')

  return (
    <div className="rounded-lg border border-info-border bg-info-subtle p-3 text-sm">
      <p className="font-medium text-info-foreground">Veli bu ay için ödeme yaptığını bildirdi.</p>
      {notice.note && <p className="mt-1 text-info-foreground/90">&ldquo;{notice.note}&rdquo;</p>}
      <p className="mt-1 text-xs text-muted-foreground">{formatSessionTime(notice.createdAt)}</p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Label htmlFor="noticeAmount" className="text-xs">
            Tahsil edilen tutar <span className="text-muted-foreground">(isteğe bağlı)</span>
          </Label>
          <Input
            id="noticeAmount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Örn. 12000"
          />
        </div>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => {
            const kurus = amount.trim() === '' ? null : parseLiraToKurus(amount)
            if (amount.trim() !== '' && kurus === null) {
              toast.error('Geçerli bir tutar girin.')
              return
            }
            onResolve('confirmed', kurus)
          }}
        >
          Onayla
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onResolve('rejected', null)}>
          Reddet
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Tutar girilirse Finans ekranına tahsilat olarak işlenir. Boş bırakılırsa yalnız bildirim kapanır.
      </p>
    </div>
  )
}

/** Sezon özetinin tek göstergesi — sayı ve süre birlikte. */
function SeasonStat({
  label,
  count,
  minutes,
  unit,
}: {
  label: string
  count: number
  minutes: number
  unit: string
}) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">
        {count} {unit}
        {count > 0 && <span className="font-normal text-muted-foreground"> · {formatMinutes(minutes)}</span>}
      </dd>
    </div>
  )
}
